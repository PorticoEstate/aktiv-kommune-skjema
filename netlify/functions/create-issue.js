const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

exports.handler = async (event) => {
  const { title, body, label, recaptcha } = JSON.parse(event.body);
  const captchaToken = recaptcha;

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const OWNER = 'PorticoEstate';
  const REPO = 'PorticoEstate';
  const PROJECT_ID = 'PVT_kwDOAhowTc4AUfeE';
  const MILESTONE_NAME = 'Innkommende feil og forslag';
  const DEFAULT_ASSIGNEE = process.env.DEFAULT_ASSIGNEE || null; // valgfri fallback

  // Map label (Kategori) -> assignee
  const getAssigneesForLabel = (lbl) => {
    switch ((lbl || '').trim().toLowerCase()) {
      case 'ny funksjonalitet':
        return ['ArildR82'];
      case 'forbedringsønske':
        return ['ArildR82'];
      case 'feil':
        return ['geirsandvoll'];
      case 'kritisk feil':
        return ['geirsandvoll'];
      default:
        return DEFAULT_ASSIGNEE ? [DEFAULT_ASSIGNEE] : []; // tom => ingen assignee
    }
  };

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
        body: JSON.stringify({ message: `Milestone "${MILESTONE_NAME}" not found.` }),
      };
    }

    // 3) Opprett issue (med assignee ut fra label)
    const assignees = getAssigneesForLabel(label);
    const issuePayload = {
      title,
      body,
      labels: label ? [label] : [],
      milestone: milestone.number,
      ...(assignees.length ? { assignees } : {}), // bare send feltet hvis vi faktisk har noen
    };

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

    // 4) Legg til i GitHub Project (Projects v2)
    const projectRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}
