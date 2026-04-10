import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { 
  MessageSquare, Users, Smartphone, Settings, BarChart2, 
  Search, Send, Paperclip, MoreVertical, LogOut, Check, CheckCheck, 
  UserCog, Edit, Trash2, Plus, X
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
  
  // Image Modal State
  const [expandedImage, setExpandedImage] = useState(null);
  
  // Users/Agents State
  const [users, setUsers] = useState([]);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [agentForm, setAgentForm] = useState({ name: '', email: '', password: '', role: 'AGENT', status: 'OFFLINE' });
  
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

  // Busca Conversas
  useEffect(() => {
    fetchConversations();
    // Refresh manual a cada X seg poderia ir aqui se nao tiver socket.
  }, []);

  // Busca Agentes quando a aba focar
  useEffect(() => {
    if (activeTab === 'agentes') {
      fetchUsers();
    }
  }, [activeTab]);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API_URL}/users`);
      setUsers(res.data);
    } catch (err) {
      console.error('Erro ao buscar agentes:', err);
    }
  };

  const openAgentModal = (agent = null) => {
    if (agent) {
      setEditingAgent(agent);
      setAgentForm({ name: agent.name, email: agent.email, password: '', role: agent.role, status: agent.status });
    } else {
      setEditingAgent(null);
      setAgentForm({ name: '', email: '', password: '', role: 'AGENT', status: 'OFFLINE' });
    }
    setIsAgentModalOpen(true);
  };

  const handleSaveAgent = async (e) => {
    e.preventDefault();
    try {
      if (editingAgent) {
        await axios.put(`${API_URL}/users/${editingAgent.id}`, agentForm);
      } else {
        await axios.post(`${API_URL}/users`, agentForm);
      }
      setIsAgentModalOpen(false);
      fetchUsers();
    } catch (err) {
      alert('Erro ao salvar agente. (Verifique se o e-mail já existe)');
    }
  };

  const handleDeleteAgent = async (id) => {
    if (window.confirm("Certeza que deseja remover este agente?")) {
      try {
        await axios.delete(`${API_URL}/users/${id}`);
        fetchUsers();
      } catch (err) {
        alert('Erro ao deletar agente. Ele pode já possuir histórico de conversas.');
      }
    }
  };

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
          <button className={`nav-item ${activeTab === 'agentes' ? 'active' : ''}`} onClick={() => setActiveTab('agentes')}>
            <UserCog size={20} />
            <span>Agentes</span>
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
                          <div className="message-image-container">
                            <img 
                              src={msg.mediaUrl} 
                              alt="Anexo" 
                              className="chat-image-thumbnail"
                              onClick={() => setExpandedImage(msg.mediaUrl)}
                            />
                          </div>
                        )}
                        {msg.type === 'AUDIO' && msg.mediaUrl && (
                          <div className="message-audio-container">
                            <audio controls src={msg.mediaUrl} className="chat-audio-player" />
                          </div>
                        )}
                        {msg.type === 'VIDEO' && msg.mediaUrl && (
                          <div className="message-video-container">
                            <video controls src={msg.mediaUrl} className="chat-video-player" />
                          </div>
                        )}
                        {msg.type === 'DOCUMENT' && msg.mediaUrl && (
                          <div className="message-document-container">
                            <a href={msg.mediaUrl} download={msg.mediaName || `documento_${msg.id.substring(0,6)}`} className="btn-document-download" title={msg.mediaName || "Baixar Documento"}>
                              <Paperclip size={16} />
                              {msg.mediaName || "Baixar Documento"}
                            </a>
                          </div>
                        )}
                        {msg.type !== 'AUDIO' && msg.type !== 'VIDEO' && msg.type !== 'IMAGE' && msg.type !== 'DOCUMENT' && msg.content}
                        {(msg.type === 'IMAGE' || msg.type === 'AUDIO' || msg.type === 'VIDEO' || msg.type === 'DOCUMENT') && msg.content && (
                           <div className="media-caption">{msg.content}</div>
                        )}
                        
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

        {/* Agentes Panel Area */}
        {activeTab === 'agentes' && (
          <div className="agents-panel">
            <div className="panel-header glass-panel">
              <div className="header-title">
                <UserCog size={24} />
                <h2>Gerenciamento de Agentes</h2>
              </div>
              <button className="btn-primary" onClick={() => openAgentModal()}><Plus size={16} /> Novo Agente</button>
            </div>
            
            <div className="agents-list glass-panel">
              <table className="agents-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Regra</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td><span className={`role-badge ${user.role.toLowerCase()}`}>{user.role === 'ADMIN' ? 'Admin' : 'Agente'}</span></td>
                      <td><span className={`status-badge ${user.status.toLowerCase()}`}>{user.status}</span></td>
                      <td className="actions-cell">
                        <button className="icon-btn text-blue" title="Editar" onClick={() => openAgentModal(user)}><Edit size={18} /></button>
                        <button className="icon-btn text-red" title="Excluir" onClick={() => handleDeleteAgent(user.id)}><Trash2 size={18} /></button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan="5" style={{textAlign: 'center', padding: '2rem'}}>Nenhum agente encontrado no banco de dados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Novo/Edição de Agente */}
            {isAgentModalOpen && (
              <div className="modal-overlay">
                <div className="modal-content glass-panel animated-modal">
                  <div className="modal-header">
                    <h3>{editingAgent ? 'Editar Agente' : 'Novo Agente'}</h3>
                    <button className="icon-btn" style={{color: 'var(--text-secondary)'}} onClick={() => setIsAgentModalOpen(false)}><X size={20} /></button>
                  </div>
                  <form onSubmit={handleSaveAgent} className="modal-form">
                    <div className="form-group">
                      <label>Nome Completo:</label>
                      <input type="text" value={agentForm.name} onChange={e => setAgentForm({...agentForm, name: e.target.value})} required className="input-glass" placeholder="Ex: João Silva" />
                    </div>
                    <div className="form-group">
                      <label>E-mail (Login):</label>
                      <input type="email" value={agentForm.email} onChange={e => setAgentForm({...agentForm, email: e.target.value})} required className="input-glass" placeholder="Ex: joao@empresa.com" />
                    </div>
                    <div className="form-group">
                      <label>Senha {editingAgent && <span className="text-muted" style={{fontSize: '0.8rem'}}>(Deixe em branco p/ não alterar)</span>}:</label>
                      <input type="password" value={agentForm.password} onChange={e => setAgentForm({...agentForm, password: e.target.value})} required={!editingAgent} className="input-glass" placeholder="********" />
                    </div>
                    <div className="form-row" style={{display: 'flex', gap: '1rem'}}>
                      <div className="form-group" style={{flex: 1}}>
                        <label>Cargo/Regra:</label>
                        <select value={agentForm.role} onChange={e => setAgentForm({...agentForm, role: e.target.value})} className="input-glass">
                          <option value="AGENT">Atendente (Agente)</option>
                          <option value="ADMIN">Administrador (Master)</option>
                        </select>
                      </div>
                      <div className="form-group" style={{flex: 1}}>
                        <label>Status:</label>
                        <select value={agentForm.status} onChange={e => setAgentForm({...agentForm, status: e.target.value})} className="input-glass">
                          <option value="OFFLINE">Offline</option>
                          <option value="ONLINE">Online</option>
                        </select>
                      </div>
                    </div>
                    <div className="modal-footer" style={{display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)'}}>
                      <button type="button" className="btn-secondary" style={{background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)'}} onClick={() => setIsAgentModalOpen(false)}>Cancelar</button>
                      <button type="submit" className="btn-primary">Salvar Agente</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
        {expandedImage && (
          <div className="fullscreen-image-modal" onClick={() => setExpandedImage(null)}>
            <div className="modal-close">X</div>
            <img src={expandedImage} alt="Fullscreen Preview" className="fullscreen-image" />
          </div>
        )}
      </main>
    </div>
  );
}
