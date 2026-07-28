const approvedTime = (contribution) =>
  Date.parse(
    contribution.latestVersion?.approved_at
      || contribution.latestVersion?.created_at
      || contribution.published_at
      || 0,
  ) || 0;

const latestVersion = (versions = []) =>
  [...versions].sort((left, right) => {
    const leftTime = Date.parse(left.approved_at || left.created_at || 0);
    const rightTime = Date.parse(right.approved_at || right.created_at || 0);
    return rightTime - leftTime;
  })[0] || null;

const officialTargetId = (officialRecord, hasOfficialAmendments) => {
  if (officialRecord?.id) return officialRecord.id;
  return hasOfficialAmendments ? '__official__' : null;
};

export function buildArchiveRecordTree({
  officialRecord = null,
  contributions = [],
} = {}) {
  const published = contributions
    .filter((contribution) => contribution?.status === 'published')
    .map((contribution) => ({
      ...contribution,
      latestVersion: contribution.latestVersion || latestVersion(contribution.versions),
      versions: [...(contribution.versions || [])],
    }))
    .filter((contribution) => contribution.latestVersion);
  const records = published.filter((contribution) => contribution.kind !== 'amendment');
  const amendments = published.filter((contribution) => contribution.kind === 'amendment');
  const hasOfficialAmendments = amendments.some((contribution) =>
    !contribution.target_contribution_id);
  const officialId = officialTargetId(officialRecord, hasOfficialAmendments);
  const recordIds = new Set(records.map((record) => record.id));
  const amendmentsByTarget = new Map();
  const orphanAmendments = [];

  amendments.forEach((amendment) => {
    const targetId = amendment.target_contribution_id || officialId;
    if (!targetId || (targetId !== officialId && !recordIds.has(targetId))) {
      orphanAmendments.push(amendment);
      return;
    }
    const targetAmendments = amendmentsByTarget.get(targetId) || [];
    targetAmendments.push(amendment);
    amendmentsByTarget.set(targetId, targetAmendments);
  });
  amendmentsByTarget.forEach((targetAmendments) => {
    targetAmendments.sort((left, right) => approvedTime(left) - approvedTime(right));
  });

  const tabs = [
    ...(officialId ? [{ id: officialId, label: '官方档案', official: true }] : []),
    ...records.map((record, index) => ({
      id: record.id,
      label: `记录 ${String(index + 1).padStart(2, '0')}`,
      official: false,
    })),
  ];

  return {
    officialTargetId: officialId,
    records,
    amendmentsByTarget,
    orphanAmendments,
    tabs,
  };
}
