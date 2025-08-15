// Netlify function: create-issue.js (uten reCAPTCHA for testing)
// Lager GitHub issues med assignee basert på Kategori (label)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const OWNER = 'PorticoEstate';
    const REPO = 'PorticoEstate';
    const PROJECT_ID = 'PVT_kwDOAhowTc4AUfeE';
    const MILESTONE_NAME = 'Innkommende feil og forslag';
    const DEFAULT_ASSIGNEE = process.env.DEFAULT_ASSIGNEE || null; // valgfri fallback

    if (!GITHUB_TOKEN) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: 'Mangler GITHUB_TOKEN' }) };
    }

    // ---- Parse body
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'Ugyldig JSON i request body' }) };
    }

    const { title, body, label } = payload;
    if (!title || !body || !label) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'Påkrevde felt: title, body, label' }) };
    }

    // ---- Hent milestone
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

    // ---- Label → assignees (Kategori)
    const l = (label || '').trim().toLowerCase();
    let assignees = [];
    if (l === 'ny funksjonalitet' || l === 'forbedringsønske') assignees = ['ArildR82'];
    else if (l === 'feil' || l === 'kritisk feil') assignees = ['geirsandvoll'];
    else if (DEFAULT_ASSIGNEE) assignees = [DEFAULT_ASSIGNEE];

    // ---- Opprett issue
    const issuePayload = {
      title,
      body,
      labels: [label],
      milestone: milestone.number,
      ...(assignees.length ? { assignees } : {}),
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

    // Vanlig ved assignee uten repo-tilgang
    if (issueRes.status === 422) {
      const errorData = await issueRes.json();
      console.error('⚠️ GitHub 422 ved oppretting:', errorData);
      const assigneeError = errorData.errors?.find(e => e.field === 'assignees');
      if (assigneeError) console.error(`Assignee-feil: ${assigneeError.message}`);

      // Fallback: opprett uten assignee
      const retryRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, body, labels: [label], milestone: milestone.number }),
      });
      const retryIssue = await retryRes.json();
      if (!retryRes.ok || !retryIssue.number) {
        return { statusCode: retryRes.status || 500, headers: CORS, body: JSON.stringify({ message: 'Feil ved oppretting av issue (fallback feilet)', error: retryIssue }) };
      }

      // Legg til i Project v2 (selv om assignee manglet)
      await addToProject({ token: GITHUB_TOKEN, projectId: PROJECT_ID, contentId: retryIssue.node_id });

      return { statusCode: 200, headers: CORS, body: JSON.stringify({ message: `Issue #${retryIssue.number} opprettet uten assignee (manglende tilgang)`, issueNumber: retryIssue.number }) };
    }

    const issue = await issueRes.json();
    if (!issueRes.ok || !issue.number) {
      return { statusCode: issueRes.status || 500, headers: CORS, body: JSON.stringify({ message: 'Feil ved oppretting av issue', error: issue }) };
    }

    // ---- Legg til i Project v2
    const projectOk = await addToProject({ token: GITHUB_TOKEN, projectId: PROJECT_ID, contentId: issue.node_id });

    if (!projectOk.ok) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ message: `Issue #${issue.number} opprettet, men kunne ikke legges i prosjekt`, errors: projectOk.errors }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ message: `Issue opprettet! Nummer: ${issue.number}`, issueNumber: issue.number, assignees }) };

  } catch (err) {
    console.error('Uventet serverfeil:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: 'Uventet serverfeil', error: String(err) }) };
  }
};

// Hjelpefunksjon: legg til i GitHub Projects v2
async function addToProject({ token, projectId, contentId }) {
  const gqlRes = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
            item { id }
          }
        }`,
      variables: { projectId, contentId },
    }),
  });

  const gqlData = await gqlRes.json();
  if (gqlData.errors) {
    console.error('❌ GraphQL Project-add feilet:', gqlData.errors);
    return { ok: false, errors: gqlData.errors };
    }
  return { ok: true };
}
