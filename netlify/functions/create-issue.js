<form id="issueForm">
  <label for="title">Tittel:</label><br>
  <input type="text" id="title" name="title" required><br><br>

  <label for="body">Beskrivelse:</label><br>
  <textarea id="body" name="body" required></textarea><br><br>

  <label for="label">Kategori:</label><br>
  <select id="label" name="label" required>
    <option value="">--Velg kategori--</option>
    <option value="Ny funksjonalitet">Ny funksjonalitet</option>
    <option value="Forbedringsønske">Forbedringsønske</option>
    <option value="Feil">Feil</option>
    <option value="Kritisk feil">Kritisk feil</option>
  </select><br><br>

  <button type="submit">Send inn</button>
</form>

<script>
document.getElementById('issueForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    title: document.getElementById('title').value.trim(),
    body: document.getElementById('body').value.trim(),
    label: document.getElementById('label').value
  };

  try {
    const res = await fetch('/.netlify/functions/create-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text);
    alert(`Status: ${res.status}\n\n${text}`);
  } catch (error) {
    console.error('Feil ved sending av issue:', error);
    alert(`Feil ved sending: ${error.message}`);
  }
});
</script>
