import { CloudPulseMetricsResponse } from '@linode/api-v4';
import { createMetricResponse } from '@src/factories/widget';
import {
  accountFactory,
  extendedDashboardFactory,
  kubeLinodeFactory,
  linodeFactory,
  metricDefinitionsFactory,
  regionFactory,
} from 'src/factories';
import { transformData } from 'src/features/CloudPulse/Utils/unitConversion';
import { getMetrics } from 'src/utilities/statMetrics';
import {
  granularity,
  timeRange,
  widgetDetails,
} from 'support/constants/widgets';
import { mockGetAccount } from 'support/intercepts/account';
import {
  mockCloudPulseCreateMetrics,
  mockCloudPulseDashboardServicesResponse,
  mockCloudPulseGetDashboards,
  mockCloudPulseGetMetricDefinitions,
  mockCloudPulseJWSToken,
  mockCloudPulseServices,
} from 'support/intercepts/cloudpulseAPIHandler';
import {
  mockAppendFeatureFlags,
  mockGetFeatureFlagClientstream,
} from 'support/intercepts/feature-flags';
import { mockGetLinodes } from 'support/intercepts/linodes';
import { mockGetUserPreferences } from 'support/intercepts/profile';
import { mockGetRegions } from 'support/intercepts/regions';
import { ui } from 'support/ui';
import {
  assertSelections,
  selectAndVerifyResource,
  selectServiceName,
  selectTimeRange,
} from 'support/util/cloudpulse';
import { makeFeatureFlagData } from 'support/util/feature-flags';
import { extendRegion } from 'support/util/regions';

import type { Flags } from 'src/featureFlags';

/**
 * This test ensures that widget titles are displayed correctly on the dashboard.
 * This test suite is dedicated to verifying the functionality and display of widgets on the Cloudpulse dashboard.
 *  It includes:
 * Validating that widgets are correctly loaded and displayed.
 * Ensuring that widget titles and data match the expected values.
 * Verifying that widget settings, such as granularity and aggregation, are applied correctly.
 * Testing widget interactions, including zooming and filtering, to ensure proper behavior.
 * Each test ensures that widgets on the dashboard operate correctly and display accurate information.
 */

const y_labels = [
  'system_cpu_utilization_ratio',
  'system_memory_usage_bytes',
  'system_network_io_bytes_total',
  'system_disk_operations_total',
];

const widgets = widgetDetails.linode;
const metrics = widgets.metrics;

export const dashboardName = widgets.dashboardName;
export const region = widgets.region;
export const actualRelativeTimeDuration = timeRange.Last24Hours;
export const resource = widgets.resource;

const widgetLabels: string[] = metrics.map((widget) => widget.title);
const metricsLabels: string[] = metrics.map((widget) => widget.name);
const service_type = widgets.service_type;
const dashboardId = widgets.id;

const dashboard = extendedDashboardFactory(
  dashboardName,
  widgetLabels,
  metricsLabels,
  y_labels,
  service_type
).build();

const metricDefinitions = metricDefinitionsFactory(
  widgetLabels,
  metricsLabels
).build();

const mockKubeLinode = kubeLinodeFactory.build();

const mockLinode = linodeFactory.build({
  label: resource,
  id: mockKubeLinode.instance_id ?? undefined,
});

const mockAccount = accountFactory.build();

const mockRegion = extendRegion(
  regionFactory.build({
    capabilities: ['Linodes'],
    id: 'us-ord',
    label: 'Chicago, IL',
    country: 'us',
  })
);
let responsePayload: CloudPulseMetricsResponse;

describe('Dashboard Widget Verification Tests', () => {
  beforeEach(() => {
    mockAppendFeatureFlags({
      aclp: makeFeatureFlagData<Flags['aclp']>({ beta: true, enabled: true }),
    }).as('getFeatureFlags');

    mockGetAccount(mockAccount).as('getAccount'); // Enables the account to have capability for Akamai Cloud Pulse
    mockGetFeatureFlagClientstream().as('getClientStream');
    mockGetLinodes([mockLinode]).as('getLinodes');

    mockCloudPulseGetMetricDefinitions(metricDefinitions, service_type);
    mockCloudPulseGetDashboards(dashboard, service_type).as('dashboard');
    mockCloudPulseServices(service_type).as('services');
    mockCloudPulseDashboardServicesResponse(dashboard, dashboardId);
    mockCloudPulseJWSToken(service_type);
    responsePayload = createMetricResponse(
      actualRelativeTimeDuration,
      granularity.Minutes
    );
    mockCloudPulseCreateMetrics(responsePayload, service_type).as('getMetrics');
    mockGetRegions([mockRegion]).as('getRegions');
  });

  it('should verify cloudpulse availability when feature flag is set to false', () => {
    mockAppendFeatureFlags({
      aclp: makeFeatureFlagData<Flags['aclp']>({ beta: true, enabled: false }),
    });
    mockGetFeatureFlagClientstream();
    cy.visitWithLogin('monitor/cloudpulse'); // since we disabled the flag here, we should have not found
    cy.findByText('Not Found').should('be.visible'); // not found
  });

  it('should set available granularity of all the widgets', () => {
    setupMethod();
    metrics.forEach((testData) => {
      cy.wait(7000); //maintaining the wait since page flicker and rendering
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector).as('widget');
      cy.get('@widget')
        .should('be.visible')
        .first()
        .within(() => {
          ui.autocomplete
            .findByTitleCustom('Select an Interval')
            .should('be.visible')
            .findByTitle('Open')
            .click();
          ui.autocompletePopper
            .findByTitle(testData.expectedGranularity)
            .as('granularityOption');
          cy.get('@granularityOption')
            .should('be.visible')
            .should('have.text', testData.expectedGranularity)
            .click();
          cy.findByDisplayValue(testData.expectedGranularity).should('exist');
          cy.findByTestId('linegraph-wrapper')
            .as('canvas')
            .should('be.visible')
            .find('tbody tr')
            .each(($tr, index) => {
              const cells = $tr
                .find('td')
                .map((i, el) => {
                  const text = Cypress.$(el).text().trim();
                  return text.replace(/^\s*\([^)]+\)/, '');
                })
                .get();
              const [title, actualMax, actualAvg, actualLast] = cells;
              const widgetValues = verifyWidgetValues(responsePayload);
              compareWidgetValues(
                {
                  title,
                  max: parseFloat(actualMax),
                  average: parseFloat(actualAvg),
                  last: parseFloat(actualLast),
                },
                widgetValues,
                testData.title
              );
              assertSelections(testData.expectedGranularity);
            });
        });
    });
  });

  it('should verify the title of the widget', () => {
    setupMethod();
    metrics.forEach((testData) => {
      const widgetSelector = `[data-qa-widget-header="${testData.title}"]`;
      cy.get(widgetSelector)
        .invoke('text')
        .then((text) => {
          expect(text.trim()).to.equal(testData.title);
        });
    });
  });

  it('should set available aggregation of all the widgets', () => {
    setupMethod();
    metrics.forEach((testData) => {
      cy.wait(7000); // maintaining the wait since page flicker and rendering
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector)
        .first()
        .should('be.visible')
        .within(() => {
          ui.autocomplete
            .findByTitleCustom('Select an Aggregate Function')
            .should('be.visible')
            .findByTitle('Open')
            .click();
          ui.autocompletePopper
            .findByTitle(testData.expectedAggregation)
            .should('be.visible')
            .should('have.text', testData.expectedAggregation)
            .click();
          cy.findByDisplayValue(testData.expectedAggregation).should('exist');
          cy.findByTestId('linegraph-wrapper')
            .as('canvas')
            .should('be.visible')
            .find('tbody tr')
            .each(($tr, index) => {
              const cells = $tr
                .find('td')
                .map((i, el) => {
                  const text = Cypress.$(el).text().trim();
                  return text.replace(/^\s*\([^)]+\)/, '');
                })
                .get();
              const [title, actualMax, actualAvg, actualLast] = cells;
              const widgetValues = verifyWidgetValues(responsePayload);
              compareWidgetValues(
                {
                  title,
                  max: parseFloat(actualMax),
                  average: parseFloat(actualAvg),
                  last: parseFloat(actualLast),
                },
                widgetValues,
                testData.title
              );
              assertSelections(testData.expectedAggregation);
            });
        });
    });
  });

  it('should verify available granularity of the widget', () => {
    setupMethod();
    metrics.forEach((testData) => {
      cy.wait(7000); //maintaining the wait since page flicker and rendering
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector)
        .first()
        .scrollIntoView()
        .should('be.visible')
        .within(() => {
          ui.autocomplete
            .findByTitleCustom('Select an Interval')
            .findByTitle('Open')
            .click();
          testData.expectedGranularityArray.forEach((option) => {
            ui.autocompletePopper.findByTitle(option).should('be.visible');
          });
          ui.autocomplete
            .findByTitleCustom('Select an Interval')
            .should('be.visible')
            .findByTitle('Close')
            .should('be.visible')
            .click();
        });
    });
  });

  it('should verify available aggregation of the widget', () => {
    setupMethod();
    metrics.forEach((testData) => {
      cy.wait(7000); //maintaining the wait since page flicker and rendering
      const widgetSelector = `[data-qa-widget="${testData.title}"]`;
      cy.get(widgetSelector)
        .first()
        .scrollIntoView()
        .should('be.visible')
        .within(() => {
          ui.autocomplete
            .findByTitleCustom('Select an Aggregate Function')
            .findByTitle('Open')
            .click();
          testData.expectedAggregationArray.forEach((option) => {
            ui.autocompletePopper.findByTitle(option).should('be.visible');
          });
          ui.autocomplete
            .findByTitleCustom('Select an Aggregate Function')
            .should('be.visible')
            .findByTitle('Close')
            .should('be.visible')
            .click();
        });
    });
  });

  it('should apply global refresh button and verify network calls', () => {
    setupMethod();

    ui.cloudpulse.findRefreshIcon().should('be.visible').click();
    cy.wait(['@getMetrics', '@getMetrics', '@getMetrics', '@getMetrics']).then(
      (interceptions) => {
        const interceptionsArray = Array.isArray(interceptions)
          ? interceptions
          : [interceptions];
        interceptionsArray.forEach((interception) => {
          const { body: requestPayload } = interception.request;
          // const { metric, time_granularity: granularity, relative_time_duration: timeRange, aggregate_function: aggregateFunction } = requestPayload;
          const {
            metric,
            time_granularity: granularity,
            relative_time_duration: timeRange,
          } = requestPayload;
          const metricData = metrics.find((data) => data.name === metric);
          if (
            !metricData ||
            !metricData.expectedGranularity ||
            !metricData.expectedAggregation
          ) {
            expect.fail(
              'metricData or its expected properties are not defined.'
            );
          }
          const expectedRelativeTimeDuration = timeRange
            ? `Last ${timeRange.value} ${
                ['hour', 'hr'].includes(timeRange.unit.toLowerCase())
                  ? 'Hours'
                  : timeRange.unit
              }`
            : '';
          const currentGranularity = granularity
            ? `${granularity.value} ${
                ['hour', 'hours'].includes(granularity.unit.toLowerCase())
                  ? 'hr'
                  : granularity.unit
              }`
            : '';
          expect(metric).to.equal(metricData.name);
          expect(currentGranularity).to.equal(metricData.expectedGranularity);
          expect(expectedRelativeTimeDuration).to.equal(
            actualRelativeTimeDuration
          );
          // expect(aggregateFunction).to.equal(metricData.expectedAggregation);
        });
      }
    );
  });

  it('should zoom in and out of all the widgets', () => {
    setupMethod();
    metrics.forEach((testData) => {
      cy.wait(7000); // Maintaining the wait since page flicker and rendering
      cy.get(`[data-qa-widget="${testData.title}"]`).as('widget');
      cy.get('@widget')
        .should('be.visible')
        .within(() => {
          ui.cloudpulse
            .findZoomButtonByTitle('zoom-in')
            .should('be.visible')
            .should('be.enabled')
            .click();
          cy.get('@widget').should('be.visible');
          cy.findByTestId('linegraph-wrapper')
            .as('canvas')
            .should('be.visible')
            .find('tbody tr')
            .each(($tr) => {
              const cells = $tr
                .find('td')
                .map((i, el) => Cypress.$(el).text().trim())
                .get();
              const [title, actualMax, actualAvg, actualLast] = cells;
              const widgetValues = verifyWidgetValues(responsePayload);
              compareWidgetValues(
                {
                  title,
                  max: parseFloat(actualMax),
                  average: parseFloat(actualAvg),
                  last: parseFloat(actualLast),
                },
                widgetValues,
                testData.title
              );
            });
          ui.cloudpulse
            .findZoomButtonByTitle('zoom-out')
            .should('be.visible')
            .should('be.enabled')
            .scrollIntoView()
            .click({ force: true });
          cy.get('@widget').should('be.visible');
          cy.findByTestId('linegraph-wrapper')
            .as('canvas')
            .should('be.visible')
            .find('tbody tr')
            .each(($tr) => {
              const cells = $tr
                .find('td')
                .map((i, el) => Cypress.$(el).text().trim())
                .get();
              const [title, actualMax, actualAvg, actualLast] = cells;
              const widgetValues = verifyWidgetValues(responsePayload);
              compareWidgetValues(
                {
                  title,
                  max: parseFloat(actualMax),
                  average: parseFloat(actualAvg),
                  last: parseFloat(actualLast),
                },
                widgetValues,
                testData.title
              );
            });
        });
    });
  });
});

const setupMethod = () => {
  mockGetUserPreferences({}).as('getUserPreferences');
  cy.visitWithLogin('monitor/cloudpulse');
  cy.get('[data-qa-header="Akamai Cloud Pulse"]')
    .should('be.visible')
    .should('have.text', 'Akamai Cloud Pulse');
  selectServiceName(dashboardName);
  assertSelections(dashboardName);
  selectTimeRange(actualRelativeTimeDuration, Object.values(timeRange));
  assertSelections(actualRelativeTimeDuration);
  ui.regionSelect.find().click().type(`${region}{enter}`);
  assertSelections(region);
  selectAndVerifyResource(resource);
};

const verifyWidgetValues = (responsePayload: CloudPulseMetricsResponse) => {
  const data = transformData(responsePayload.data.result[0].values, 'Bytes');
  const { average, last, max } = getMetrics(data);
  const roundedAverage = Math.round(average * 100) / 100;
  const roundedLast = Math.round(last * 100) / 100;
  const roundedMax = Math.round(max * 100) / 100;
  return { average: roundedAverage, last: roundedLast, max: roundedMax };
};

/**
 * Compares actual widget values to the expected values and asserts their equality.
 *
 * @param actualValues - The actual values retrieved from the widget, consisting of:
 *   @param actualValues.max - The maximum value shown on the widget.
 *   @param actualValues.average - The average value shown on the widget.
 *   @param actualValues.last - The last or most recent value shown on the widget.
 *
 * @param expectedValues - The expected values that the widget should display, consisting of:
 *   @param expectedValues.max - The expected maximum value.
 *   @param expectedValues.average - The expected average value.
 *   @param expectedValues.last - The expected last or most recent value.
 */

const compareWidgetValues = (
  actualValues: { title: string; max: number; average: number; last: number },
  expectedValues: { max: number; average: number; last: number },
  title: string
) => {
  expect(actualValues.max).to.equal(
    expectedValues.max,
    `Expected ${expectedValues.max} for max, but got ${actualValues.max}`
  );

  expect(actualValues.average).to.equal(
    expectedValues.average,
    `Expected ${expectedValues.average} for average, but got ${actualValues.average}`
  );

  expect(actualValues.last).to.equal(
    expectedValues.last,
    `Expected ${expectedValues.last} for last, but got ${actualValues.last}`
  );

  const extractedTitle = actualValues.title.substring(
    0,
    actualValues.title.indexOf(' ', actualValues.title.indexOf(' ') + 1)
  );

  expect(extractedTitle).to.equal(
    title,
    `Expected ${title} for title ${extractedTitle}`
  );
};
