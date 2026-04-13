import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const loggedUser = JSON.parse(localStorage.getItem('crm_user') || '{}');
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

  // Contacts State
  const [contacts, setContacts] = useState([]);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactForm, setContactForm] = useState({ name: '', phoneNumber: '' });
  
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
      const { conversationId, message } = data;
      
      // Notificação sonora se for mensagem recebida (não enviada por nós)
      if (!message.fromMe) {
        const audio = new Audio('/notification.mp3');
        audio.play().catch(e => console.log('Autoplay bloqueado. Aguardando interação do usuário.'));
      }

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

  // Busca Agentes ou Contatos quando a aba focar
  useEffect(() => {
    if (activeTab === 'agentes') {
      fetchUsers();
    } else if (activeTab === 'contatos') {
      fetchContacts();
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

  // --- CONTATOS FUNÇÕES ---
  const fetchContacts = async () => {
    try {
      const res = await axios.get(`${API_URL}/contacts`);
      setContacts(res.data);
    } catch (err) {
      console.error('Erro ao buscar contatos:', err);
    }
  };

  const handleSaveContact = async (e) => {
    e.preventDefault();
    try {
      if (editingContact) {
        await axios.put(`${API_URL}/contacts/${editingContact.id}`, contactForm);
      } else {
        await axios.post(`${API_URL}/contacts`, contactForm);
      }
      setIsContactModalOpen(false);
      fetchContacts();
    } catch (err) {
      alert('Erro ao salvar contato. (Verifique se o número de telefone já existe)');
    }
  };

  const handleDeleteContact = async (id) => {
    if (window.confirm("Certeza que deseja remover este contato?")) {
      try {
        await axios.delete(`${API_URL}/contacts/${id}`);
        fetchContacts();
      } catch (err) {
        alert('Erro ao deletar contato. Ele pode já possuir histórico de conversas.');
      }
    }
  };

  const handleStartConversation = async (contact) => {
    try {
      const res = await axios.post(`${API_URL}/contacts/${contact.id}/start-chat`);
      setActiveTab('conversas');
      handleSelectChat(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao iniciar conversa');
    }
  };

  // --- CONVERSAS FUNÇÕES ---
  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/conversations`, {
        params: { userId: loggedUser.id, role: loggedUser.role }
      });
      setConversations(res.data);
    } catch (err) {
      console.error('Erro buscando conversas', err);
    }
  };

  const handleSelectChat = async (conv) => {
    setActiveChat(conv);
    try {
      const res = await axios.get(`${API_URL}/conversations/${conv.id}/messages`);
      setMessages(res.data);
    } catch (err) {
      console.error('Erro ao buscar historico', err);
    }
  };

  const handleAcceptChat = async () => {
    if (!activeChat) return;
    try {
      const res = await axios.patch(`${API_URL}/conversations/${activeChat.id}/accept`, {
        userId: loggedUser.id
      });
      setActiveChat(res.data);
      // Atualiza na lista: remove de outros agentes (status ACTIVE + userId deles)
      fetchConversations();
    } catch (err) {
      alert('Erro ao aceitar atendimento');
    }
  };

  const handleCloseChat = async () => {
    if (!activeChat) return;
    if (!window.confirm('Finalizar este atendimento?')) return;
    try {
      await axios.patch(`${API_URL}/conversations/${activeChat.id}/close`);
      // Remove da lista e fecha o chat
      setConversations(prev => prev.filter(c => c.id !== activeChat.id));
      setActiveChat(null);
      setMessages([]);
    } catch (err) {
      alert('Erro ao finalizar atendimento');
    }
  };

  const fileInputRef = useRef(null);
  const [attachment, setAttachment] = useState(null);

  const handleSendMessage = async () => {
    if (!activeChat) return;
    if (!inputText.trim() && !attachment) return;
    
    let textToSend = inputText;
    
    // Adiciona assinatura do agente se houver texto
    if (textToSend.trim() && loggedUser.name) {
      textToSend = `*${loggedUser.name}*\n${textToSend}`;
    }
    
    const currentAttachment = attachment;
    
    setInputText('');
    setAttachment(null);

    try {
      await axios.post(`${API_URL}/messages/send`, {
        conversationId: activeChat.id,
        text: textToSend,
        mediaBase64: currentAttachment ? currentAttachment.base64 : null,
        mediaType: currentAttachment ? currentAttachment.type : null,
        mediaName: currentAttachment ? currentAttachment.name : null,
        userId: loggedUser.id || 'admin-init-12345'
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
            <div className="avatar">{loggedUser.name?.charAt(0)?.toUpperCase() || 'A'}</div>
            <div className="user-info">
              <span className="user-name">{loggedUser.name || 'Administrador'}</span>
              <span className="user-status">Online</span>
            </div>
            <button className="logout-btn" title="Sair" onClick={() => {
              localStorage.removeItem('crm_user');
              navigate('/login');
            }}><LogOut size={16} /></button>
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
                    className={`conversation-item ${activeChat?.id === conv.id ? 'active' : ''} ${conv.status === 'WAITING' ? 'conv-waiting' : ''}`} 
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
                            <span style={{color: 'var(--warning)'}}>⏳ Aguarda Atendimento</span>
                          ) : conv.status === 'ACTIVE' ? (
                            <span style={{color: '#22c55e'}}>
                              🟢 {conv.user?.name ? `Atendido por ${conv.user.name}` : conv.lastMessage || 'Em Atendimento'}
                            </span>
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
                    {activeChat.status === 'WAITING' && (
                      <button className="btn-accept" onClick={handleAcceptChat} title="Aceitar Atendimento">
                        ✅ Aceitar Atendimento
                      </button>
                    )}
                    {activeChat.status === 'ACTIVE' && (
                      <button className="btn-close-chat" onClick={handleCloseChat} title="Finalizar Atendimento">
                        🔴 Finalizar
                      </button>
                    )}
                    <span className={`status-badge status-${activeChat.status?.toLowerCase()}`}>
                      {activeChat.status === 'WAITING' ? '⏳ Aguardando' : activeChat.status === 'ACTIVE' ? '🟢 Em Atendimento' : '⛔ Fechado'}
                    </span>
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
                        {(msg.type === 'IMAGE' || msg.type === 'AUDIO' || msg.type === 'VIDEO' || msg.type === 'DOCUMENT') && 
                          msg.content && 
                          !['[Mídia]', '🎵 [Áudio]', '🎵 [Áudio enviado]'].includes(msg.content) && (
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
                  {activeChat.status === 'WAITING' ? (
                    <div className="chat-blocked-notice">
                      <span>⏳ Clique em <strong>"Aceitar Atendimento"</strong> para começar a responder.</span>
                    </div>
                  ) : activeChat.status === 'CLOSED' ? (
                    <div className="chat-blocked-notice">
                      <span>⛔ Este atendimento foi finalizado.</span>
                    </div>
                  ) : (
                    <>
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
                        placeholder="Digite sua mensagem..." 
                        className="message-input" 
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        onKeyPress={handleKeyPress}
                      />
                      <button className="btn-primary send-btn" onClick={handleSendMessage} disabled={!inputText.trim() && !attachment}>
                        <Send size={18} />
                      </button>
                    </>
                  )}
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

      {/* TELA: CONTATOS */}
      {activeTab === 'contatos' && (
        <div className="agents-panel glass-panel">
          <div className="agents-header">
            <h2>Gerenciamento de Contatos</h2>
            <button className="btn-primary" onClick={() => {
              setEditingContact(null);
              setContactForm({ name: '', phoneNumber: '' });
              setIsContactModalOpen(true);
            }}>
              <Plus size={18} /> Novo Contato
            </button>
          </div>

          <div className="table-responsive">
            <table className="agents-table">
              <thead>
                <tr>
                  <th>Avatar</th>
                  <th>Nome do Cliente</th>
                  <th>Telefone (WhatsApp)</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {contacts.length === 0 ? (
                  <tr><td colSpan="4" style={{textAlign:'center', padding:'2rem'}}>Nenhum contato encontrado.</td></tr>
                ) : contacts.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="avatar bg-alt">
                        {c.name ? c.name.charAt(0).toUpperCase() : 'C'}
                      </div>
                    </td>
                    <td><span className="agent-name">{c.name || 'Desconhecido'}</span></td>
                    <td>{c.phoneNumber}</td>
                    <td>
                      <div className="actions-cell">
                        <button className="btn-chat-start" onClick={() => handleStartConversation(c)} title="Iniciar Chat Exclusivo">
                          <MessageSquare size={16} /> Chamar
                        </button>
                        <button className="icon-btn" onClick={() => {
                          setEditingContact(c);
                          setContactForm({ name: c.name || '', phoneNumber: c.phoneNumber });
                          setIsContactModalOpen(true);
                        }} title="Editar">
                          <Edit size={18} className="text-blue" />
                        </button>
                        <button className="icon-btn" onClick={() => handleDeleteContact(c.id)} title="Excluir">
                          <Trash2 size={18} className="text-danger" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {/* Modal Criar/Editar Contato */}
      {isContactModalOpen && (
        <div className="modal-overlay">
          <div className="agent-modal glass-panel">
            <div className="modal-header">
              <h2>{editingContact ? 'Editar Contato' : 'Adicionar Novo Contato'}</h2>
              <button className="close-btn icon-btn" onClick={() => setIsContactModalOpen(false)}>
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSaveContact} className="agent-form">
              <div className="form-group">
                <label>Nome do Cliente / Empresa</label>
                <input 
                  type="text" 
                  value={contactForm.name} 
                  onChange={(e) => setContactForm({...contactForm, name: e.target.value})}
                  placeholder="Ex: João da Silva"
                  className="input-glass"
                />
              </div>

              <div className="form-group">
                <label>WhatsApp (com DDI e DDD)</label>
                <input 
                  type="text" 
                  value={contactForm.phoneNumber} 
                  onChange={(e) => setContactForm({...contactForm, phoneNumber: e.target.value})}
                  required
                  placeholder="Ex: 5511999999999"
                  className="input-glass"
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsContactModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">
                  {editingContact ? 'Salvar Alterações' : 'Salvar Contato'}
                </button>
              </div>
            </form>
          </div>
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
