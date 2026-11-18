import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const url = new URL(request.url);
    const organizationId = z.string().uuid().safeParse(url.searchParams.get('organizationId'));
    if (!organizationId.success) {
      return NextResponse.json({ error: 'A valid organizationId is required' }, { status: 400 });
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('organization_id', organizationId.data)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });

    const threadId = url.searchParams.get('threadId');
    if (threadId) {
      const parsedThreadId = z.string().uuid().safeParse(threadId);
      if (!parsedThreadId.success) return NextResponse.json({ error: 'Invalid threadId' }, { status: 400 });

      const { data: thread } = await supabase
        .from('copilot_threads')
        .select('id,title,created_at')
        .eq('id', parsedThreadId.data)
        .eq('organization_id', organizationId.data)
        .eq('created_by', user.id)
        .maybeSingle();
      if (!thread) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

      const { data: messages, error } = await supabase
        .from('copilot_messages')
        .select('id,role,content,evidence,created_at')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) return NextResponse.json({ error: 'Could not load conversation' }, { status: 500 });
      return NextResponse.json({ thread, messages: messages ?? [] });
    }

    const { data: threads, error } = await supabase
      .from('copilot_threads')
      .select('id,title,created_at')
      .eq('organization_id', organizationId.data)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) return NextResponse.json({ error: 'Could not load conversation history' }, { status: 500 });
    return NextResponse.json({ threads: threads ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Service unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
