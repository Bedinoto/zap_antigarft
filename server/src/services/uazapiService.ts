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
    'token': INSTANCE_TOKEN
  }
});

export const UazapiService = {
  // Enviar uma mensagem de texto simples
  sendText: async (instanceName: string, number: string, text: string) => {
    try {
      const response = await api.post(`/send/text`, {
        number: number,
        text: text
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar mensagem uazapi:`, error.response?.data || error.message);
      throw error;
    }
  },

  // Enviar Arquivo/Imagem (em Base64)
  sendMedia: async (instanceName: string, number: string, base64: string, caption: string, extName: string = 'image') => {
    try {
      const response = await api.post(`/send/media`, {
        number: number,
        type: extName, // "image", "document", "audio", "video"
        text: caption || "",
        file: base64
      });
      return response.data;
    } catch (error: any) {
      console.error(`Erro ao enviar midia uazapi:`, error.response?.data || error.message);
      throw error;
    }
  },

  // Baixar Mídia Recebida (Original HD)
  downloadMedia: async (messageId: string) => {
    try {
      const response = await api.post(`/message/download`, {
        id: messageId,
        return_base64: true
      });
      return response.data; // { base64Data, fileURL, mimetype }
    } catch (error: any) {
      console.error(`Erro ao baixar midia uazapi:`, error.response?.data || error.message);
      return null;
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
