export const permissions = [
  // Posts
  'posts:list',
  'posts:view',
  'posts:create',
  'posts:edit',

  // Users
  'users:promote',
] as const

export type Permission = typeof permissions[number]
export const anonymousPermissions: ReadonlySet<Permission> = new Set<Permission>([
  // Posts
  'posts:list',
  'posts:view',
])
