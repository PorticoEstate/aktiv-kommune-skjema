// create-issue.js (Netlify function)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  try {
    const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const OWNER = 'PorticoEstate';
    const REPO = 'PorticoEstate';
    const PROJECT_ID = 'PVT_kwDOAhowTc4AUfeE';
    const MILESTONE_NAME = 'Innkommende feil og forslag';
    const DEFAULT_ASSIGNEE = process.env.DEFAULT_ASSIGNEE || null;

    if (!RECAPTCHA_SECRET || !GITHUB_TOKEN) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: 'Mangler RECAPTCHA_SECRET_KEY eller GITHUB_TOKEN' }) };
    }

    // --- Parse body
    let payload;
    try { payload = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'Ugyldig JSON i request body' }) }; }

    const { title, body, label, recaptcha } = payload;
    if (!title || !body || !label || !recaptcha) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'Påkrevde felt: title, body, label, recaptcha' }) };
    }

    // --- reCAPTCHA
    const captchaRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(RECAPTCHA_SECRET)}&response=${encodeURIComponent(recaptcha)}`
    });
    const captchaData = await captchaRes.json();
    if (!captchaData.success) {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ message: 'reCAPTCHA-validering feilet' }) };
    }

    // --- Milestone
    const msRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/milestones`, {
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json' },
    });
    if (!msRes.ok) {
      return { statusCode: msRes.status, headers: CORS, body: JSON.stringify({ message: 'Kunne ikke hente milestones', error: await msRes.text() }) };
    }
    const milestones = await msRes.json();
    const milestone = milestones.find(m => m.title === MILESTONE_NAME);
    if (!milestone) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ message: `Milestone "${MILESTONE_NAME}" ikke funnet` }) };
    }

    // --- Label -> assignees
    const l = (label || '').trim().toLowerCase();
    let assignees = [];
    if (l === 'ny funksjonalitet' || l === 'forbedringsønske') assignees = ['ArildR82'];
    else if (l === 'feil' || l === 'kritisk feil') assignees = ['geirsandvoll'];
    else if (DEFAULT_ASSIGNEE) assignees = [DEFAULT_ASSIGNEE];

    // --- Opprett issue
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
        milestone: milestone.number,
        ...(assignees.length ? { assignees } : {}),
      }),
    });

    const issue = await issueRes.json();
    if (!issueRes.ok || !issue.number) {
      return { statusCode: issueRes.status || 500, headers: CORS, body: JSON.stringify({ message: 'Feil ved oppretting av issue', error: issue }) };
    }

    // --- Legg til i Project v2
