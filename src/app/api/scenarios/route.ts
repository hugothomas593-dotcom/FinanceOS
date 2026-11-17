import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
const CreateSchema = z.object({ organizationId: z.string().uuid(), modelVersionId: z.string().uuid().nullable().optional(), name: z.string().trim().min(2).max(120), scenarioType: z.string().max(40).default('custom'), assumptions: z.record(z.string(), z.unknown()), outputs: z.record(z.string(), z.unknown()) });

const TrackingSchema = z.object({
  organizationId: z.string().uuid(),
  scenarioId: z.string().uuid(),
  owner: z.string().trim().max(120).default(''),
  reviewDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).nullable(),
  status: z.enum(['planned', 'in_progress', 'reviewed', 'completed', 'paused']),
  actualEndingCash: z.number().finite().nullable(),
  actualOutcomeNote: z.string().trim().max(1_000).default(''),
});

export async function GET(req: Request) {
  try { const { supabase,user } = await requireUser(); const org = new URL(req.url).searchParams.get('organizationId'); if (!org) return NextResponse.json({error:'organizationId required'},{status:400});
    const {data:member}=await supabase.from('organization_members').select('role').eq('organization_id',org).eq('user_id',user.id).maybeSingle(); if(!member)return NextResponse.json({error:'Organization access denied'},{status:403});
    const {data,error}=await supabase.from('scenarios').select('id,name,scenario_type,model_version_id,assumptions,outputs,created_at,updated_at').eq('organization_id',org).order('created_at',{ascending:false}).limit(100); if(error)return NextResponse.json({error:'Could not load scenarios'},{status:500}); return NextResponse.json({scenarios:data});
  } catch(e){const m=e instanceof Error?e.message:'';return NextResponse.json({error:m==='UNAUTHENTICATED'?'Authentication required':'Service unavailable'},{status:m==='UNAUTHENTICATED'?401:503});}
}
export async function POST(req: Request) {
  try { const {supabase,user}=await requireUser(); const parsed=CreateSchema.safeParse(await req.json()); if(!parsed.success)return NextResponse.json({error:'Invalid scenario'},{status:400}); const p=parsed.data;
    const {data:member}=await supabase.from('organization_members').select('role').eq('organization_id',p.organizationId).eq('user_id',user.id).maybeSingle(); if(!member)return NextResponse.json({error:'Organization access denied'},{status:403}); if(!['owner','admin','finance'].includes(member.role))return NextResponse.json({error:'Insufficient permissions'},{status:403});
    if (p.modelVersionId) {
      const { data: modelVersion, error: modelVersionError } = await supabase
        .from('model_versions')
        .select('id')
        .eq('id', p.modelVersionId)
        .eq('organization_id', p.organizationId)
        .maybeSingle();
      if (modelVersionError) return NextResponse.json({ error: 'Could not validate the scenario model version' }, { status: 500 });
      if (!modelVersion) return NextResponse.json({ error: 'Model version does not belong to this workspace' }, { status: 400 });
    }
    const {data,error}=await supabase.from('scenarios').insert({organization_id:p.organizationId,model_version_id:p.modelVersionId??null,name:p.name,scenario_type:p.scenarioType,assumptions:p.assumptions,outputs:p.outputs,created_by:user.id}).select('id,name,scenario_type,model_version_id,assumptions,outputs,created_at,updated_at').single(); if(error)return NextResponse.json({error:'Could not save scenario'},{status:500}); await supabase.from('audit_events').insert({organization_id:p.organizationId,actor_id:user.id,event_type:'scenario.created',entity_type:'scenario',entity_id:data.id,after_state:{name:p.name}}); return NextResponse.json({scenario:data},{status:201});
  } catch(e){const m=e instanceof Error?e.message:'';return NextResponse.json({error:m==='UNAUTHENTICATED'?'Authentication required':'Service unavailable'},{status:m==='UNAUTHENTICATED'?401:503});}
}


export async function PATCH(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const parsed = TrackingSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid decision review details' }, { status: 400 });
    const p = parsed.data;
    const { data: member } = await supabase.from('organization_members').select('role')
      .eq('organization_id', p.organizationId).eq('user_id', user.id).maybeSingle();
    if (!member) return NextResponse.json({ error: 'Organization access denied' }, { status: 403 });
    if (!['owner', 'admin', 'finance'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { data: scenario, error: scenarioError } = await supabase.from('scenarios')
      .select('id,assumptions')
      .eq('id', p.scenarioId)
      .eq('organization_id', p.organizationId)
      .maybeSingle();
    if (scenarioError) return NextResponse.json({ error: 'Could not load this saved decision' }, { status: 500 });
    if (!scenario) return NextResponse.json({ error: 'Saved decision not found' }, { status: 404 });

    const assumptions = scenario.assumptions && typeof scenario.assumptions === 'object' && !Array.isArray(scenario.assumptions)
      ? scenario.assumptions as Record<string, unknown>
      : {};
    const decisionTracking = {
      owner: p.owner,
      reviewDate: p.reviewDate,
      status: p.status,
      actualEndingCash: p.actualEndingCash,
      actualOutcomeNote: p.actualOutcomeNote,
      updatedAt: new Date().toISOString(),
    };
    const { data: updated, error: updateError } = await supabase.from('scenarios')
      .update({ assumptions: { ...assumptions, decisionTracking }, updated_at: decisionTracking.updatedAt })
      .eq('id', p.scenarioId)
      .eq('organization_id', p.organizationId)
      .select('id,assumptions,updated_at')
      .single();
    if (updateError || !updated) return NextResponse.json({ error: 'Could not save decision review details' }, { status: 500 });

    await supabase.from('audit_events').insert({
      organization_id: p.organizationId,
      actor_id: user.id,
      event_type: 'scenario.review_updated',
      entity_type: 'scenario',
      entity_id: p.scenarioId,
      after_state: { decisionTracking },
    });
    return NextResponse.json({ saved: true, assumptions: updated.assumptions, updatedAt: updated.updated_at });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unauthenticated = message === 'UNAUTHENTICATED';
    return NextResponse.json(
      { error: unauthenticated ? 'Authentication required' : 'Service unavailable' },
      { status: unauthenticated ? 401 : 503 },
    );
  }
}
