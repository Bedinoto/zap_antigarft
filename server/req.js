const axios = require('axios');

async function test() {
  console.log("Testando POST /send/text ...");
  try {
    const res = await axios.post('https://bedinoto.uazapi.com/send/text', {
      number: "551199999999",
      text: "teste"
    }, {
      headers: {
        'token': 'a5fdab6f-0e1d-407c-aa4e-e6b44f935509'
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
