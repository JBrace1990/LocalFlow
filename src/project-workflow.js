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
