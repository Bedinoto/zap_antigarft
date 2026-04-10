const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function test() {
  console.log("Testando POST /send/media com FormData...");
  
  // Criar um arquivo dummy fake localmente e ler
  const fakeImagePath = path.join(__dirname, 'fake.jpg');
  fs.writeFileSync(fakeImagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));

  const form = new FormData();
  form.append('file', fs.createReadStream(fakeImagePath));

  try {
    const res = await axios.post('https://bedinoto.uazapi.com/send/media?number=555596636076&caption=Teste', form, {
      headers: {
        'token': 'a5fdab6f-0e1d-407c-aa4e-e6b44f935509',
        ...form.getHeaders()
      }
    });
    console.log("Success:", res.data);
  } catch (e) {
    if (e.response) {
      console.log("Error:", e.response.status, e.response.data);
    } else {
      console.log("Network error", e.message);
    }
  } finally {
    if(fs.existsSync(fakeImagePath)) fs.unlinkSync(fakeImagePath);
  }
}

test();
