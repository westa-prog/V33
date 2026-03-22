
import React, { useState, useRef, useEffect } from 'react';
import { Bot, User, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from 'framer-motion';
import { PromptInputBox } from './ui/ai-prompt-box';
import { HeroGeometricContent } from './ui/shape-landing-hero';
import { addAIMessage, clearAIThread, fetchAIMessages } from '../services/aiAssistantService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface AIAssistantProps {
  userId?: string;
}

const initialAssistantMessage = (): Message => ({
  id: 'assistant-welcome',
  role: 'assistant',
  text: "Hello! I'm your Leader A1 AI Assistant. I can help you analyze fleet compliance, draft driver notices, or answer questions about ELD regulations. How can I assist you today?",
  timestamp: new Date()
});

export const AIAssistant: React.FC<AIAssistantProps> = ({ userId }) => {
  const [messages, setMessages] = useState<Message[]>([
    initialAssistantMessage()
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedThread, setHasLoadedThread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    let isActive = true;

    const loadMessages = async () => {
      if (!userId) {
        setMessages([initialAssistantMessage()]);
        setHasLoadedThread(true);
        return;
      }

      try {
        const storedMessages = await fetchAIMessages(userId);
        if (!isActive) return;

        if (storedMessages.length === 0) {
          setMessages([initialAssistantMessage()]);
        } else {
          setMessages(storedMessages.map(message => ({
            id: message.id,
            role: message.role,
            text: message.text,
            timestamp: new Date(message.createdAt)
          })));
        }
      } catch (error) {
        console.error('Failed to load AI thread:', error);
        if (isActive) {
          setMessages([initialAssistantMessage()]);
        }
      } finally {
        if (isActive) {
          setHasLoadedThread(true);
        }
      }
    };

    loadMessages();

    return () => {
      isActive = false;
    };
  }, [userId]);

  const handleSend = async (messageText: string, files?: File[]) => {
    if (!messageText.trim() || isLoading || !userId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: messageText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      await addAIMessage(userId, 'user', messageText);
      const apiKey =
        ((import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined) ||
        ((import.meta as any).env?.GEMINI_API_KEY as string | undefined) ||
        ((process as any)?.env?.GEMINI_API_KEY as string | undefined) ||
        ((process as any)?.env?.API_KEY as string | undefined) ||
        '';
      if (!apiKey) {
        throw new Error('Gemini API key is missing.');
      }

      const ai = new GoogleGenAI({ apiKey });

      const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: "You are the Leader A1 AI Assistant, a professional expert in fleet management, DOT compliance, and ELD (Electronic Logging Device) regulations. Your tone is professional, helpful, and concise. You help fleet managers optimize their operations and maintain safety standards.",
        }
      });

      const result = await chat.sendMessage({ message: messageText });
      const responseText = result.text || "I'm sorry, I couldn't process that request.";

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: responseText,
        timestamp: new Date()
      };

      await addAIMessage(userId, 'assistant', responseText);
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error("AI Error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: "I could not reach Gemini. Please verify VITE_GEMINI_API_KEY is set in Render and redeploy.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = async () => {
    if (userId) {
      try {
        await clearAIThread(userId);
      } catch (error) {
        console.error('Failed to clear AI thread:', error);
      }
    }

    setMessages([{
      id: Date.now().toString(),
      role: 'assistant',
      text: "Chat cleared. How else can I help you?",
      timestamp: new Date()
    }]);
  };

  const quickActions = [
    "Draft a safety warning",
    "Explain HOS rules",
    "Analyze fleet risk",
    "Write a reconnection guide"
  ];

  if (!hasLoadedThread) {
    return (
      <div className="flex items-center justify-center h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-semibold">Loading AI workspace...</span>
        </div>
      </div>
    );
  }

  const isInitialState = messages.length <= 1;

  if (isInitialState) {
    return (
      <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
        
        {/* Light Mode Layout (Hidden in Dark Mode) */}
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-[radial-gradient(125%_125%_at_50%_101%,rgba(245,87,2,1)_10.5%,rgba(245,120,2,1)_16%,rgba(245,140,2,1)_17.5%,rgba(245,170,100,1)_25%,rgba(238,174,202,1)_40%,rgba(202,179,214,1)_65%,rgba(148,201,233,1)_100%)] dark:hidden">
            <div className="max-w-[700px] w-full px-6 flex flex-col items-center">
                <h2 className="text-3xl font-black text-white mb-8 tracking-tight drop-shadow-md text-center">Hello, how can I help you today?</h2>
                
                <PromptInputBox 
                  onSend={handleSend} 
                  isLoading={isLoading} 
                  placeholder="Ask anything about your fleet or regulations..."
                  className="bg-[#1F2023]/90 backdrop-blur-md border-[#333333] shadow-2xl"
                />
                
                <div className="flex flex-wrap justify-center gap-2 mt-8">
                  {quickActions.map(action => (
                    <button
                      key={action}
                      onClick={() => handleSend(action)}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-full text-sm font-bold text-white transition-all shadow-sm"
                    >
                      {action}
                    </button>
                  ))}
                </div>
                
                <div className="mt-8 flex items-center justify-center gap-4 text-xs text-white/70 font-bold uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 bg-white/50 rounded-full"></span>
                  <span>Leader A1 Compliance Intelligence</span>
                  <span className="w-1.5 h-1.5 bg-white/50 rounded-full"></span>
                </div>
            </div>
        </div>

        {/* Dark Mode Layout (Hidden in Light Mode) */}
        <div className="absolute inset-0 hidden dark:block text-white">
          <HeroGeometricContent badge="Leader A1" title1="AI Fleet" title2="Assistant">
             <div className="max-w-[700px] w-full mx-auto flex flex-col items-center">
               <PromptInputBox 
                  onSend={handleSend} 
                  isLoading={isLoading} 
                  placeholder="Ask anything about your fleet or regulations..."
                  className="bg-[#1F2023]/90 backdrop-blur-md border-[#333333] shadow-2xl"
                />
                <div className="flex flex-wrap justify-center gap-2 mt-8">
                  {quickActions.map(action => (
                    <button
                      key={action}
                      onClick={() => handleSend(action)}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-full text-sm font-bold text-white transition-all shadow-sm"
                    >
                      {action}
                    </button>
                  ))}
                </div>
             </div>
          </HeroGeometricContent>
        </div>

      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors relative">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-950 transition-colors z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-md font-bold text-slate-900 dark:text-white leading-none">AI Fleet Assistant</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">Powered by Gemini 3 Pro</p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
          title="Clear Conversation"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50 dark:bg-slate-900">
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
             idx > 0 && ( /* Skip the initial hidden prompt since we handle it in the big view */
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600' : 'bg-slate-900 dark:bg-slate-800 text-white'
                  }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm transition-colors ${msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-none'
                  : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-200 dark:border-slate-700'
                  }`}>
                  {msg.text}
                  <div className={`text-[10px] mt-2 opacity-50 font-medium ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </motion.div>
            )
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="flex gap-3 max-w-[85%]">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-wider italic">Thinking...</span>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-colors shrink-0">
        <div className="max-w-[800px] mx-auto">
          <PromptInputBox 
            onSend={handleSend} 
            isLoading={isLoading} 
            placeholder="Ask anything about your fleet or regulations..."
            className="bg-[#1F2023] border-[#333333]"
          />
        </div>
      </div>
    </div>
  );
};
