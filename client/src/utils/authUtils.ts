/**
 * Institutional Authentication & Authorization Utility Helpers
 */

export function isUserAdmin(user: any): boolean {
  return Boolean(user && user.role === 'admin');
}

export function isUserClassTeacher(user: any): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'class_teacher') return true;
  if (Array.isArray(user.classTeacherClassIds) && user.classTeacherClassIds.length > 0) return true;
  return false;
}

export function isUserSectionHead(user: any): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (Array.isArray(user.sectionHeadSectionIds) && user.sectionHeadSectionIds.length > 0) {
    return true;
  }
  if (
    Array.isArray(user.authorizations) &&
    user.authorizations.some((a: any) => a.auth_role === 'section_head')
  ) {
    return true;
  }
  return false;
}
