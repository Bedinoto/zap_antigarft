import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ArrowRight } from 'lucide-react';
import './Login.css';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    // TODO: Connect to backend auth
    navigate('/');
  };

  return (
    <div className="login-container">
      {/* Background elements */}
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      
      <div className="login-box glass-panel animate-fade-in">
        <div className="login-header">
          <div className="logo-container">
            <span className="logo-text">ZaP</span>
            <span className="logo-badge">CRM</span>
          </div>
          <p className="login-subtitle">Bem-vindo de volta, acesse seu painel.</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <label>E-mail</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={18} />
              <input 
                type="email" 
                className="input-glass" 
                placeholder="admin@admin.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label>Senha</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={18} />
              <input 
                type="password" 
                className="input-glass" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-primary login-btn">
            Entrar no Sistema
            <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
