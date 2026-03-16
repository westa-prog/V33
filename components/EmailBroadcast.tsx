import React, { useState, useRef } from 'react';
import { Mail, Send, Paperclip, X, File as FileIcon, Image as ImageIcon, Video as VideoIcon, Loader2, CheckCircle2 } from 'lucide-react';
import { Driver } from '../types';
import { sendGmailBroadcast } from '../services/gmailService';

interface EmailBroadcastProps {
    drivers: Driver[];
    assignedBoard?: string;
    firebaseUid?: string;
    userAccessToken?: string;
}

export const EmailBroadcast: React.FC<EmailBroadcastProps> = ({ drivers, assignedBoard, firebaseUid, userAccessToken }) => {
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState(false);
    
    // Derived unique boards from current driver list
    const availableBoards = Array.from(new Set(drivers.map(d => d.board).filter(Boolean))) as string[];

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files as FileList)]);
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const toggleDriverSelection = (email: string) => {
        if (!email) return;
        setSelectedDrivers(prev => 
            prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
        );
    };

    const selectAllDrivers = () => {
        const allEmails = drivers.map(d => d.company_email || d.email).filter(Boolean) as string[];
        setSelectedDrivers(allEmails);
    };

    const selectBoard = (board: string) => {
        const boardEmails = drivers.filter(d => d.board === board).map(d => d.company_email || d.email).filter(Boolean) as string[];
        // Merge without duplicates
        setSelectedDrivers(prev => Array.from(new Set([...prev, ...boardEmails])));
    };

    const clearSelection = () => {
        setSelectedDrivers([]);
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]); // remove data:image/jpeg;base64,
            };
            reader.onerror = error => reject(error);
        });
    };

    const handleBroadcast = async () => {
        if (selectedDrivers.length === 0) return alert('Please select at least one recipient.');
        if (!subject.trim() || !message.trim()) return alert('Subject and Message are required.');
        if (!firebaseUid) return alert('You must be logged in to send broadcasts.');

        setIsSending(true);
        setSendSuccess(false);

        try {
            // Send via Google Gmail API if logged in with OAuth
            if (userAccessToken && userAccessToken !== 'demo_token') {
                const base64Files = await Promise.all(files.map(async file => ({
                    name: file.name,
                    type: file.type || 'application/octet-stream',
                    base64: await fileToBase64(file)
                })));

                const bccRecipients = selectedDrivers; // Since it's an array of emails
                const res = await sendGmailBroadcast(userAccessToken, bccRecipients, subject, message, base64Files);

                if (!res.ok) {
                    throw new Error(res.error || 'Gmail API failed to send broadcast.');
                }
            } else {
                // Fallback: Send to Node backend for SMTP logic / Mock simulation
                const formData = new FormData();
                formData.append('recipients', JSON.stringify(selectedDrivers));
                formData.append('subject', subject);
                formData.append('message', message);
                files.forEach(file => {
                    formData.append('attachments', file);
                });

                const baseUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:5000';
                const res = await fetch(`${baseUrl}/api/eld/broadcast`, {
                    method: 'POST',
                    body: formData
                });

                const text = await res.text();
                
                if (!res.ok) {
                    let errorObj;
                    try { errorObj = JSON.parse(text); } catch(e) {}
                    throw new Error(errorObj?.error || `Upload failed: Request failed with status code ${res.status}`);
                }
            }

            setSendSuccess(true);
            setSubject('');
            setMessage('');
            setFiles([]);
            setSelectedDrivers([]);
            
            setTimeout(() => setSendSuccess(false), 5000);
        } catch (err: any) {
            console.error('Broadcast failed:', err);
            alert(err.message || 'Failed to send broadcast');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
                        <Mail className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Custom Email Broadcast</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Send direct emails with attachments to your fleet</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Column: Recipients Menu */}
                    <div className="lg:col-span-4 space-y-4">
                        <div>
                            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">Targets ({selectedDrivers.length})</h3>
                            
                            <div className="space-y-2 mb-4">
                                <button onClick={selectAllDrivers} className="w-full text-left px-3 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-700 dark:text-slate-300 rounded-lg transition-colors">
                                    + Select All ({drivers.length})
                                </button>
                                {availableBoards.map(board => (
                                    <button key={board} onClick={() => selectBoard(board)} className="w-full text-left px-3 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-700 dark:text-slate-300 rounded-lg transition-colors">
                                        + Select {board} ({drivers.filter(d => d.board === board).length})
                                    </button>
                                ))}
                                {selectedDrivers.length > 0 && (
                                    <button onClick={clearSelection} className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors">
                                        Clear Selection
                                    </button>
                                )}
                            </div>

                            <div className="max-h-[300px] overflow-y-auto space-y-1 pr-2 custom-scrollbar border border-slate-100 dark:border-slate-800 rounded-xl p-2 bg-slate-50 dark:bg-slate-900/50">
                                {drivers.map(driver => {
                                    const email = driver.company_email || driver.email;
                                    const isSelected = selectedDrivers.includes(email || '');
                                    
                                    if (!email) return null; // Can't email drivers without email
                                    
                                    return (
                                        <label key={driver.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'}`}>
                                            <input 
                                                type="checkbox" 
                                                checked={isSelected}
                                                onChange={() => toggleDriverSelection(email)}
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{driver.name || `Driver ${driver.id}`}</div>
                                                <div className="text-xs text-slate-500 truncate">{email}</div>
                                            </div>
                                            <div className="text-[10px] uppercase font-bold text-slate-400 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                {driver.board || 'No Board'}
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Email Composer */}
                    <div className="lg:col-span-8 space-y-5">
                        <div className="space-y-4 bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Subject</label>
                                <input 
                                    type="text" 
                                    value={subject}
                                    onChange={e => setSubject(e.target.value)}
                                    placeholder="Enter email subject"
                                    className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Message Body</label>
                                <textarea 
                                    rows={8}
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="Type your message here... Supports HTML formatting if you wish."
                                    className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                                ></textarea>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Attachments (Pdfs, Images, Videos)</label>
                                <div className="space-y-3">
                                    <div className="flex flex-wrap gap-2">
                                        {files.map((file, i) => (
                                            <div key={i} className="flex items-center gap-2 pl-3 pr-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300">
                                                {file.type.startsWith('image') ? <ImageIcon className="w-3.5 h-3.5 text-blue-500" /> : file.type.startsWith('video') ? <VideoIcon className="w-3.5 h-3.5 text-purple-500" /> : <FileIcon className="w-3.5 h-3.5 text-slate-400" />}
                                                <span className="truncate max-w-[150px]">{file.name}</span>
                                                <button onClick={() => removeFile(i)} className="ml-1 text-slate-400 hover:text-red-500 focus:outline-none">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex">
                                        <input 
                                            type="file" 
                                            multiple 
                                            ref={fileInputRef} 
                                            onChange={handleFileSelect} 
                                            className="hidden" 
                                        />
                                        <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-bold transition-colors"
                                        >
                                            <Paperclip className="w-4 h-4" /> Add Files
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            {sendSuccess ? (
                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 rounded-xl">
                                    <CheckCircle2 className="w-5 h-5" /> Broadcast Sent Successfully!
                                </div>
                            ) : (
                                <div className="text-sm font-medium text-slate-500">
                                    {selectedDrivers.length > 0 ? `Targeting ${selectedDrivers.length} active recipients` : 'Select recipients to continue'}
                                </div>
                            )}

                            <button 
                                onClick={handleBroadcast}
                                disabled={isSending || selectedDrivers.length === 0 || !subject || !message}
                                className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold shadow-md transition-all ${
                                    isSending || selectedDrivers.length === 0 || !subject || !message
                                        ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed' 
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
                                }`}
                            >
                                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {isSending ? 'Sending Broadcast...' : 'Send Broadcast'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
