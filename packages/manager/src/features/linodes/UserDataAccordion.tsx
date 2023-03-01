import * as React from 'react';
import Accordion from 'src/components/Accordion';
import { makeStyles } from 'src/components/core/styles';
import Typography from 'src/components/core/Typography';
import ExternalLink from 'src/components/ExternalLink';
import HelpIcon from 'src/components/HelpIcon';
import Notice from 'src/components/Notice';
import Link from 'src/components/Link';
import TextField from 'src/components/TextField';

interface Props {
  userData: string | undefined;
  onChange: (userData: string) => void;
  disabled?: boolean;
}

const useStyles = makeStyles(() => ({
  helpIcon: {
    padding: '0px 0px 4px 8px',
    '& svg': {
      fill: 'currentColor',
      stroke: 'none',
    },
  },
  accordionSummary: {
    padding: '5px 24px 0px 24px',
  },
  accordionDetail: {
    padding: '0px 24px 24px 24px',
  },
}));

const UserDataAccordion = (props: Props) => {
  const { disabled, userData, onChange } = props;
  const [formatWarning, setFormatWarning] = React.useState(false);

  const classes = useStyles();

  const checkFormat = (userData: string, isOnChange: boolean) => {
    const userDataLower = userData.toLowerCase();
    if (
      userData.length > 0 &&
      !userDataLower.startsWith('#cloud-config') &&
      !userDataLower.startsWith('content-type: text/') &&
      !userDataLower.startsWith('#!')
    ) {
      if (!isOnChange) {
        setFormatWarning(true);
      }
    } else {
      setFormatWarning(false);
    }
  };

  const accordionHeading = (
    <>
      Add User Data{' '}
      <HelpIcon
        text={
          <>
            User data is part of a virtual machine&rsquo;s cloud-init metadata
            containing information related to a user&rsquo;s local account.{' '}
            <Link to="/">Learn more.</Link>
          </>
        }
        className={classes.helpIcon}
        interactive
      />
    </>
  );

  return (
    <Accordion
      heading={accordionHeading}
      style={{ marginTop: 24 }}
      headingProps={{
        variant: 'h2',
      }}
      summaryProps={{
        classes: {
          root: classes.accordionSummary,
        },
      }}
      detailProps={{
        classes: {
          root: classes.accordionDetail,
        },
      }}
    >
      <Typography>
        <Link to="https://cloudinit.readthedocs.io/en/latest/reference/examples.html">
          User Data
        </Link>{' '}
        is part of a virtual machine&rsquo;s cloud-init metadata that contains
        anything related to a user&rsquo;s local account, including username and
        user group(s). <br /> Accepted formats are YAML and bash.{' '}
        <Link to="https://www.linode.com/docs">Learn more.</Link>
      </Typography>
      {formatWarning ? (
        <Notice warning spacingTop={16} spacingBottom={16}>
          This user data may not be in a format accepted by cloud-init. See{' '}
          <ExternalLink
            text="cloud-init documentation"
            link="https://cloudinit.readthedocs.io/en/latest/explanation/format.html"
            fixedIcon
          />{' '}
          for more information.
        </Notice>
      ) : null}
      <TextField
        label="User Data"
        multiline
        rows={1}
        expand
        onChange={(e) => {
          checkFormat(e.target.value, true);
          onChange(e.target.value);
        }}
        value={userData}
        disabled={Boolean(disabled)}
        onBlur={(e) => checkFormat(e.target.value, false)}
        data-qa-user-data-input
      />
    </Accordion>
  );
};

export default UserDataAccordion;
