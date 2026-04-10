const axios = require('axios');

async function test() {
  console.log("Testando POST /message/download ...");
  try {
    const res = await axios.post('https://bedinoto.uazapi.com/message/download', {
      id: "3EB0504556AD70F023A109", // O mesmo messageid daquele webhook
      return_base64: true
    }, {
      headers: {
        'token': 'a5fdab6f-0e1d-407c-aa4e-e6b44f935509'
      }
    });
    console.log("Status:", res.status);
    // Ver o chaves da resposta:
    console.log("Chaves retornadas:", Object.keys(res.data));
    if (res.data.base64) {
      console.log("SUCESSO: Tamanho do base64:", res.data.base64.length);
    }
  } catch (e) {
    if (e.response) {
      console.log("Error:", e.response.status, e.response.data);
    } else {
      console.log("Network error", e.message);
    }
  }
}

test();
