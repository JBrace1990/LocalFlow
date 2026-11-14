export function normalizeLegacyStoryboardApproval(project) {
  if (
    !project ||
    project.visualDevelopmentRequired === true ||
    project.visualDevelopmentApproved === true ||
    !Array.isArray(project.shots) ||
    project.shots.length === 0
  ) {
    return project;
  }

  return {
    ...project,
    visualDevelopmentApproved: true,
    visualDevelopmentStatus: 'complete',
  };
}

export function isStoryboardDraftEditable(draft) {
  return Boolean(
    draft &&
    Array.isArray(draft.scenes) &&
    draft.scenes.length > 0 &&
    ['storyboard-review', 'complete'].includes(draft.status)
  );
}

export function completeStoryboardApproval(messages, sceneCount) {
  const rows = Array.isArray(messages) ? messages : [];
  const approvalIndex = rows.findLastIndex(message =>
    message?.role === 'assistant' &&
    Array.isArray(message.choices) &&
    message.choices.some(choice => choice?.action === 'approve-storyboard')
  );
  if (approvalIndex < 0) return messages;

  const approval = rows[approvalIndex];
  const approvedChoice = approval.choices.find(choice => choice?.action === 'approve-storyboard');
  return rows.map((message, index) => index === approvalIndex
    ? {
        ...message,
        content: `Storyboard approved. Created ${Math.max(0, Number(sceneCount) || 0)} scenes and opened Studio.`,
        choices: [],
        selectedChoiceReply: approvedChoice.reply,
      }
    : message);
}

const assetLabels = asset => [asset?.name, ...(Array.isArray(asset?.aliases)
  ? asset.aliases
  : String(asset?.aliases || '').split(/[,;|]/))]
  .map(value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase())
  .filter(Boolean);

const hasApprovedDesign = asset => (asset?.designReferences || []).some(frame =>
  frame?.url && frame.enabled !== false && frame.rating === 'preferred');

export const unapprovedStoryboardDesignAssets = assets => (Array.isArray(assets) ? assets : [])
  .filter(asset => asset?.designStatus !== 'approved' && !hasApprovedDesign(asset));

export function updateProjectVisualBible(project, visualBible, visualStyle) {
  return { ...project, visualBible, visualStyle };
}

/**
 * Match storyboard-plan designs to the saved visual assets for the same project.
 * Legacy storyboard revisions can lose their draft asset array; in that case
 * the project-scoped visual asset list is the only safe recovery source.
 */
export function resolveStoryboardDesignAssets(draftAssets, projectAssets) {
  const saved = Array.isArray(projectAssets) ? projectAssets : [];
  const requested = Array.isArray(draftAssets) && draftAssets.length ? draftAssets : saved;
  const assets = [];
  const missing = [];

  for (const draft of requested) {
    const idMatch = draft?.id && saved.find(asset => String(asset.id) === String(draft.id));
    let match = idMatch || null;
    if (match && !hasApprovedDesign(match) && match.designStatus !== 'approved') {
      const labels = new Set(assetLabels(draft));
      const category = String(draft?.category || '').trim().toLocaleLowerCase();
      const approvedCandidates = saved.filter(asset => {
        if (category && String(asset?.category || '').trim().toLocaleLowerCase() !== category) return false;
        return (hasApprovedDesign(asset) || asset?.designStatus === 'approved') && assetLabels(asset).some(label => labels.has(label));
      });
      if (approvedCandidates.length === 1) match = approvedCandidates[0];
    }
    if (!match) {
      const labels = new Set(assetLabels(draft));
      const category = String(draft?.category || '').trim().toLocaleLowerCase();
      const candidates = saved.filter(asset => {
        if (category && String(asset?.category || '').trim().toLocaleLowerCase() !== category) return false;
        return assetLabels(asset).some(label => labels.has(label));
      });
      if (candidates.length === 1) match = candidates[0];
      else if (candidates.length > 1) {
        const approved = candidates.filter(hasApprovedDesign);
        if (approved.length === 1) match = approved[0];
      }
    }
    if (match) {
      if (!assets.some(asset => String(asset.id) === String(match.id))) assets.push(match);
    } else {
      missing.push(draft?.name || draft?.id || 'Unnamed design');
    }
  }

  return { assets, missing };
}

export function preserveStoryboardDraftAssets(revisedDraft, previousDraft) {
  const oldAssets = Array.isArray(previousDraft?.assets) ? previousDraft.assets : [];
  const newAssets = Array.isArray(revisedDraft?.assets) ? revisedDraft.assets : [];
  return {
    ...revisedDraft,
    assets: oldAssets.length ? oldAssets : newAssets,
    projectId: previousDraft?.projectId || revisedDraft?.projectId,
  };
}

export function storyboardKeyframeTargets(scenes) {
  return (Array.isArray(scenes) ? scenes : []).filter(scene => scene && !scene.image);
}

export async function queueStoryboardKeyframesInOrder(scenes, submit) {
  const targets = storyboardKeyframeTargets(scenes);
  for (const scene of targets) await submit(scene);
  return targets.length;
}
