import { supabase } from '../supabase';

export interface AIMessageRecord {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    createdAt: string;
}

const DEFAULT_THREAD_TITLE = 'Leader A1 AI Assistant';

export const ensureAIThread = async (userId: string): Promise<string> => {
    const { data: existingThread, error: fetchError } = await supabase
        .from('ai_threads')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (fetchError) {
        throw fetchError;
    }

    if (existingThread?.id) {
        return existingThread.id;
    }

    const { data: createdThread, error: createError } = await supabase
        .from('ai_threads')
        .insert({
            user_id: userId,
            title: DEFAULT_THREAD_TITLE
        })
        .select('id')
        .single();

    if (createError) {
        throw createError;
    }

    return createdThread.id;
};

export const fetchAIMessages = async (userId: string): Promise<AIMessageRecord[]> => {
    const threadId = await ensureAIThread(userId);
    const { data, error } = await supabase
        .from('ai_messages')
        .select('id, role, content, created_at')
        .eq('thread_id', threadId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) {
        throw error;
    }

    return (data || []).map(row => ({
        id: row.id,
        role: row.role,
        text: row.content,
        createdAt: row.created_at
    }));
};

export const addAIMessage = async (userId: string, role: 'user' | 'assistant', text: string) => {
    const threadId = await ensureAIThread(userId);
    const { error } = await supabase.from('ai_messages').insert({
        thread_id: threadId,
        user_id: userId,
        role,
        content: text
    });

    if (error) {
        throw error;
    }
};

export const clearAIThread = async (userId: string) => {
    const threadId = await ensureAIThread(userId);
    const { error } = await supabase
        .from('ai_messages')
        .delete()
        .eq('thread_id', threadId)
        .eq('user_id', userId);

    if (error) {
        throw error;
    }
};
