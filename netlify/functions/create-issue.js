const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const OWNER = 'PorticoEstate';
const REPO = 'PorticoEstate';
const PROJECT_ID = 'PVT_kwDOAhowTc4AUfeE';
const MILESTONE_NAME = 'Innkommende feil og forslag';

exports.handler = async (event) => {
  const { title, body, label, recaptcha } = JSON.parse(event.body);
  const captchaToken = recaptcha;

  // 1) Valider reCAPTCHA
  const captchaRes = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${RECAPTCHA_SECRET}&response=${encodeURIComponent(captchaToken)}`
  });

  const captchaData = await captchaRes.json();

  if (!captchaData.success) {
    return {
      statusCode: 403,
      body: JSON.stringify({ message: 'reCAPTCHA-validering feilet. Innsending avvist.' }),
    };
  }

  try {
    // 2) Hent milestone
    const milestoneRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/milestones`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
      },
    });

    if (!milestoneRes.ok) {
      return {
        statusCode: milestoneRes.status,
        body: JSON.stringify({ message: 'Kunne ikke hente milestones.', error: await milestoneRes.text() }),
      };
    }

    const milestones = await milestoneRes.json();
    const milestone = milestones.find(m => m.title === MILESTONE_NAME);

    if (!milestone) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: `Milestone "${MILESTONE_NAME}" ikke funnet.` }),
      };
    }

    // 3) Tildel assignee basert på valgt kategori (label)
    let assignee = null;

    switch (label) {
      case 'Ny funksjonalitet':
        assignee = 'ArildR82';
        break;
      case 'Kritisk feil':
        assignee = 'geirsandvoll';
        break;
      case 'Feil':
        assignee = 'geirsandvoll';
        break;
      case 'Forbedringsønske':
        assignee = 'ArildR82';
        break;
      default:
        assignee = null;
    }

    // 4) Bygg issuePayload
    const issuePayload = {
      title,
      body,
      labels: label ? [label] : [],
      milestone: milestone.number,
      ...(assignee && { assignees: [assignee] }),
    };

    // 5) Opprett issue
    const issueRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(issuePayload),
    });

    const issue = await issueRes.json();

    if (!issueRes.ok || !issue.number) {
      return {
        statusCode: issueRes.status || 500,
        body: JSON.stringify({ message: 'Feil ved oppretting av issue.', error: issue }),
      };
    }

    // 6) Legg til i GitHub Project (Projects v2)
    const projectRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
              item { id }
            }
          }
        `,
        variables: {
          projectId: PROJECT_ID,
          contentId: issue.node_id,
        },
      }),
    });

    const projectData = await projectRes.json();

    if (projectData.errors) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Issue ble opprettet, men kunne ikke legges til i prosjekt.', errors: projectData.errors }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Issue opprettet! Nummer: ${issue.number}`, issueNumber: issue.number }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Uventet serverfeil.', error: error.message }),
    };
  }
};
