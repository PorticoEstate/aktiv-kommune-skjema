const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

exports.handler = async (event) => {
  const { title, description, category, role, contact, url, recaptcha } = JSON.parse(event.body);

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

  // Verifiser reCAPTCHA
  const verifyRes = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `secret=${RECAPTCHA_SECRET}&response=${recaptcha}`
  });
  const recaptchaData = await verifyRes.json();

  if (!recaptchaData.success) {
    return {
      statusCode: 403,
      body: JSON.stringify({ message: 'reCAPTCHA-verifisering feilet' }),
    };
  }

  const OWNER = 'PorticoEstate';
  const REPO = 'aktiv-kommune-skjema';
  const PROJECT_ID = 'PVT_kwDOAhowTc4AUfeE'; // ditt GitHub prosjekt-ID
  const MILESTONE_NAME = 'Innkommende feil og forslag';

  // Finn milestone-ID
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
      body: JSON.stringify({ message: 'Milestone ikke funnet' }),
    };
  }

  // Sett opp issue-body
  let body = `## Beskrivelse\n${description}\n\n## Din rolle\n${role}`;
  if (contact && contact.trim() !== '') body += `\n\n## Kontaktinformasjon\n${contact}`;
  if (url && url.trim() !== '') body += `\n\n## Lenke til side der feilen oppstår\n${url}`;

  // Opprett issue
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
      milestone: milestone.number,
      labels: [category]
    }),
  });

  const issue = await issueRes.json();

  if (!issue.number) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Kunne ikke opprette issue.', error: issue }),
    };
  }

  // Legg til issue i prosjekt
  const projectAddRes = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        mutation {
          addProjectV2ItemById(input: {projectId: "${PROJECT_ID}", contentId: "${issue.node_id}"}) {
            item {
              id
            }
          }
        }
      `,
    }),
  });
  const projectData = await projectAddRes.json();

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
};
