import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.UAZAPI_SERVER_URL;
const ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN;
const INSTANCE_TOKEN = process.env.UAZAPI_INSTANCE_TOKEN;

// Configuração base do Axios para a API Externa uazapiGO
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'apikey': INSTANCE_TOKEN // Header padrão em APIS Whatsapp (pode ser Authorization: Bearer TB)
  }
});

export const UazapiService = {
  // Enviar uma mensagem de texto simples
  sendText: async (instanceName: string, number: string, text: string) => {
    try {
      // Ajuste o endpoint conforme a doc exata da uazapi (ex: /message/sendText ou /chat/sendmessage)
      const response = await api.post(`/message/sendText/${instanceName}`, {
        number: number,
        options: {
          delay: 1200,
          presence: "composing"
        },
        textMessage: {
          text: text
        }
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar mensagem uazapi:`, error.response?.data || error.message);
      throw error;
    }
  },

  // Checar o status da instância
  checkConnection: async (instanceName: string) => {
    try {
      const response = await api.get(`/instance/connectionState/${instanceName}`);
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao checar conexão uazapi:`, error.response?.data || error.message);
      throw error;
    }
  }
};
