const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

exports.handler = async (event) => {
  const { title, body, label, recaptcha } = JSON.parse(event.body);
const captchaToken = recaptcha;

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = 'PorticoEstate';
  const REPO = 'aktiv-kommune-skjema';
  const PROJECT_ID = 'PVT_kwDOAhowTc4AUfeE';
  const MILESTONE_NAME = 'Innkommende feil og forslag';

  // 1. Valider reCAPTCHA
  const captchaRes = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${RECAPTCHA_SECRET}&response=${captchaToken}`
  });
  const captchaData = await captchaRes.json();

  if (!captchaData.success) {
    return {
      statusCode: 403,
      body: JSON.stringify({ message: 'reCAPTCHA-validering feilet. Innsending avvist.' }),
    };
  }

  try {
    const milestoneRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/milestones`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    const milestones = await milestoneRes.json();
    const milestone = milestones.find(m => m.title === MILESTONE_NAME);

    if (!milestone) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: `Milestone "${MILESTONE_NAME}" not found.` }),
      };
    }

    const issueRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body,
        labels: [label],
        milestone: milestone.number
      }),
    });

    const issue = await issueRes.json();

    if (!issue.number) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Feil ved oppretting av issue.', error: issue }),
      };
    }

    const projectRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation {
            addProjectV2ItemById(input: {projectId: "${PROJECT_ID}", contentId: "${issue.node_id}"}) {
              item { id }
            }
          }
        `,
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
      body: JSON.stringify({ message: `Issue opprettet! Nummer: ${issue.number}` }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Uventet serverfeil.', error: error.message }),
    };
  }
};
