const axios = require('axios');

async function test() {
  console.log("Testando POST /send/media com JSON...");
  
  try {
    const res = await axios.post('https://bedinoto.uazapi.com/send/media', {
      number: "555596636076",
      type: "image",
      text: "legenda do arquivo",
      file: "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    }, {
      headers: {
        'token': 'a5fdab6f-0e1d-407c-aa4e-e6b44f935509',
        'Content-Type': 'application/json'
      }
    });
    console.log("Success:", res.data);
  } catch (e) {
    if (e.response) {
      console.log("Error:", e.response.status, e.response.data);
    } else {
      console.log("Network error", e.message);
    }
  }
}

test();
