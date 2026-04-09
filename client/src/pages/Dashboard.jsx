import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { 
  MessageSquare, Users, Smartphone, Settings, BarChart2, 
  Search, Send, Paperclip, MoreVertical, LogOut, Check, CheckCheck 
} from 'lucide-react';
import './Dashboard.css';

const isProd = window.location.hostname !== 'localhost';
const API_URL = isProd ? 'https://zap-api-fq2p.onrender.com/api' : 'http://localhost:3001/api';
const SOCKET_URL = isProd ? 'https://zap-api-fq2p.onrender.com' : 'http://localhost:3001';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('conversas');
  
  // Data State
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  
  // Input State
  const [inputText, setInputText] = useState('');
  
  // Socket State
  const [socket, setSocket] = useState(null);
  const messagesEndRef = useRef(null);

  // Auto scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle Initial Data Fetch and Socket initialization
  useEffect(() => {
    // Busca inicial das conversas
    fetchConversations();

    // Inicia socket globalmente
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    // Eventos do Socket
    newSocket.on('new_message', (data) => {
      const { conversationId, message, fromAgent } = data;
      
      // Update Mensagens se a mesma conversa estiver ativa
      setActiveChat((prevActiveChat) => {
        if (prevActiveChat && prevActiveChat.id === conversationId) {
          setMessages((prev) => [...prev, message]);
        }
        return prevActiveChat;
      });

      // Recarrega as conversas para atualizar a última mensagem / last message list
      fetchConversations();
    });

    newSocket.on('queue_updated', () => {
      fetchConversations();
    });

    return () => newSocket.close();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/conversations`);
      setConversations(res.data);
    } catch (err) {
      console.error('Erro buscando conversas', err);
    }
  };

  const handleSelectChat = async (conv) => {
    setActiveChat(conv);
    // Fetch History
    try {
      const res = await axios.get(`${API_URL}/conversations/${conv.id}/messages`);
      setMessages(res.data);
    } catch (err) {
      console.error('Erro ao buscar historico', err);
    }
  };

  const fileInputRef = useRef(null);
  const [attachment, setAttachment] = useState(null);

  const handleSendMessage = async () => {
    if (!activeChat) return;
    if (!inputText.trim() && !attachment) return;
    
    const textToSend = inputText;
    const currentAttachment = attachment;
    
    setInputText('');
    setAttachment(null);

    try {
      await axios.post(`${API_URL}/messages/send`, {
        conversationId: activeChat.id,
        text: textToSend,
        mediaBase64: currentAttachment ? currentAttachment.base64 : null,
        mediaType: currentAttachment ? currentAttachment.type : null,
        userId: 'admin-init-12345'
      });
    } catch (err) {
      console.error('Falha ao enviar mensagem', err);
      alert('Erro ao enviar mensagem');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachment({
          base64: event.target.result,
          type: file.type.startsWith('image/') ? 'image' : 'document',
          name: file.name
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Funções Utilitárias de Tela
  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo-text">ZaP</span>
          <span className="logo-badge">CRM</span>
        </div>
        
        <nav className="sidebar-nav">
          <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <BarChart2 size={20} />
            <span>Dashboard</span>
          </button>
          <button className={`nav-item ${activeTab === 'conversas' ? 'active' : ''}`} onClick={() => setActiveTab('conversas')}>
            <MessageSquare size={20} />
            <span>Conversas</span>
            {conversations.filter(c => c.status === 'WAITING').length > 0 && (
              <span className="badge">{conversations.filter(c => c.status === 'WAITING').length}</span>
            )}
          </button>
          <button className={`nav-item ${activeTab === 'contatos' ? 'active' : ''}`} onClick={() => setActiveTab('contatos')}>
            <Users size={20} />
            <span>Contatos</span>
          </button>
          <button className={`nav-item ${activeTab === 'conexoes' ? 'active' : ''}`} onClick={() => setActiveTab('conexoes')}>
            <Smartphone size={20} />
            <span>Conexões</span>
          </button>
          <button className={`nav-item ${activeTab === 'configuracoes' ? 'active' : ''}`} onClick={() => setActiveTab('configuracoes')}>
            <Settings size={20} />
            <span>Configurações</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar">A</div>
            <div className="user-info">
              <span className="user-name">Administrador Geral</span>
              <span className="user-status">Online</span>
            </div>
            <button className="logout-btn" title="Sair"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === 'conversas' && (
          <div className="chat-interface">
            {/* Conversations List */}
            <div className="chat-sidebar glass-panel">
              <div className="chat-sidebar-header">
                <h3>Mensagens</h3>
                <div className="search-bar">
                  <Search size={16} className="search-icon" />
                  <input type="text" placeholder="Buscar contatos..." className="input-glass" />
                </div>
              </div>

              <div className="conversation-list">
                {conversations.length === 0 && (
                  <p className="text-muted" style={{textAlign: 'center', padding: '1rem'}}>Nenhuma conversa ainda.</p>
                )}
                {conversations.map(conv => (
                  <div 
                    key={conv.id} 
                    className={`conversation-item ${activeChat?.id === conv.id ? 'active' : ''}`} 
                    onClick={() => handleSelectChat(conv)}
                  >
                    <div className="avatar bg-alt">{conv.contact?.name?.charAt(0).toUpperCase() || 'C'}</div>
                    <div className="conversation-details">
                      <div className="conversation-top">
                        <span className="contact-name">{conv.contact?.name || conv.contact?.phoneNumber}</span>
                        <span className="time">{formatTime(conv.updatedAt)}</span>
                      </div>
                      <div className="conversation-bottom">
                        <span className={`last-message ${conv.status === 'WAITING' ? 'unread' : ''}`}>
                          {conv.status === 'WAITING' ? (
                            <span style={{color: 'var(--warning)'}}>Aguarda Atendimento: {conv.lastMessage}</span>
                          ) : (
                            <>
                              <CheckCheck size={14} className="read-status text-blue" />
                              {conv.lastMessage || 'Nova Conversa'}
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Chat Area */}
            {activeChat ? (
              <div className="chat-window">
                <div className="chat-header glass-panel">
                  <div className="chat-title">
                    <div className="avatar">{activeChat.contact?.name?.charAt(0).toUpperCase() || 'C'}</div>
                    <div className="contact-info">
                      <span className="name">{activeChat.contact?.name || 'Contato'}</span>
                      <span className="status">{activeChat.contact?.phoneNumber}</span>
                    </div>
                  </div>
                  <div className="chat-actions">
                    <button className="icon-btn"><Search size={20} /></button>
                    <button className="icon-btn"><MoreVertical size={20} /></button>
                  </div>
                </div>

                <div className="chat-messages">
                  {messages.map((msg, idx) => (
                    <div key={msg.id || idx} className={`message ${msg.fromMe ? 'sent' : 'received'}`}>
                      <div className="message-content">
                        {msg.type === 'IMAGE' && msg.mediaUrl && (
                          <div style={{ marginBottom: '8px' }}>
                            <img 
                              src={msg.mediaUrl} 
                              alt="Anexo" 
                              style={{ maxWidth: '100%', borderRadius: '8px', cursor: 'pointer' }}
                              onClick={() => window.open(msg.mediaUrl, '_blank')}
                            />
                          </div>
                        )}
                        {msg.content}
                        {msg.fromMe && <CheckCheck size={14} className="read-status" />}
                      </div>
                      <span className="message-time">{formatTime(msg.createdAt || new Date())}</span>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className="chat-input-area glass-panel">
                  {attachment && (
                    <div className="attachment-preview">
                      <div className="preview-info">
                        <Paperclip size={14} />
                        <span>{attachment.name}</span>
                      </div>
                      <button className="remove-btn" onClick={() => setAttachment(null)}>X</button>
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{display: 'none'}} 
                    onChange={handleFileSelect}
                  />
                  <button className="icon-btn attachment-btn" title="Anexar Arquivo" onClick={() => fileInputRef.current.click()}>
                    <Paperclip size={20} />
                  </button>
                  <input 
                    type="text" 
                    placeholder="Digite sua mensagem (opcional se enviar anexo)..." 
                    className="message-input" 
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyPress={handleKeyPress}
                  />
                  <button className="btn-primary send-btn" onClick={handleSendMessage} disabled={!inputText.trim() && !attachment}>
                    <Send size={18} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="chat-window empty-state">
                <MessageSquare size={64} className="empty-icon text-muted" />
                <h2>Nenhuma conversa selecionada</h2>
                <p className="text-muted">Clique em um contato na barra do lado esquerdo para assumir o atendimento e conversar.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
