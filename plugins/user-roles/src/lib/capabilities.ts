/**
 * WordPress 兼容的能力矩阵。
 *
 * 角色层级：administrator > editor > author > contributor > subscriber
 * 每个角色继承其下级的全部能力。
 */

export type Role = "administrator" | "editor" | "author" | "contributor" | "subscriber";

export const ALL_ROLES: Role[] = ["administrator", "editor", "author", "contributor", "subscriber"];

/** 能力 → 拥有该能力的最低角色（该角色及其上级均拥有此能力） */
const CAP_MIN_ROLE: Record<string, Role> = {
  // 管理员独占
  manage_options: "administrator",
  manage_users: "administrator",
  activate_plugins: "administrator",
  edit_theme_options: "administrator",
  manage_categories: "administrator",

  // 编辑者及以上
  edit_others_posts: "editor",
  publish_pages: "editor",
  delete_pages: "editor",
  delete_others_posts: "editor",

  // 作者及以上
  publish_posts: "author",
  delete_posts: "author",
  upload_files: "author",

  // 贡献者及以上
  edit_posts: "contributor",

  // 所有登录用户
  read: "subscriber",
};

const ROLE_HIERARCHY: Record<Role, number> = {
  administrator: 5,
  editor: 4,
  author: 3,
  contributor: 2,
  subscriber: 1,
};

/** 判断指定角色是否拥有某能力 */
export function hasCapability(role: Role, cap: string): boolean {
  const minRole = CAP_MIN_ROLE[cap];
  if (!minRole) return true; // 未知能力默认放行
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole];
}

/**
 * 后台页面 → 所需能力映射。
 * 未列出的页面默认只需 read（所有登录用户可访问）。
 */
const PAGE_CAP: Record<string, string> = {
  // 管理员独占页面
  "/admin/settings": "manage_options",
  "/admin/plugins": "activate_plugins",
  "/admin/themes": "edit_theme_options",
  "/admin/post-types": "manage_options",
  "/admin/custom-fields": "manage_options",

  // 用户管理
  "/admin/users": "manage_users",

  // 编辑者及以上
  "/admin/pages": "edit_others_posts",
  "/admin/menus": "edit_theme_options",

  // 分类管理（编辑者及以上）
  "/admin/taxonomies": "manage_categories",
};

/**
 * API 路径 → 所需能力映射。
 * 未列出的 API 默认只需 read。
 */
const API_CAP: Record<string, string> = {
  // 管理员独占 API
  "/api/users": "manage_users",
  "/api/themes": "manage_options",
  "/api/post-types": "manage_options",
  "/api/taxonomies": "manage_categories",
  "/api/setup": "manage_options",

  // 页面/菜单管理（编辑者及以上）
  "/api/pages": "edit_others_posts",
  "/api/menus": "edit_theme_options",
};

/**
 * 用户自助路径：这些 /admin-ext 路径只操作登录者**本人**的数据，
 * 任何登录用户（read）即可访问，不应被管理员规则拦截。
 * exact = 精确匹配；prefix = 前缀匹配。
 */
const SELF_SERVICE_PATHS: ReadonlyArray<{ exact?: string; prefix?: string }> = [
  // 两步验证：用户管理本人的验证器（setup/verify/disable/status）
  { prefix: "/admin-ext/api/2fa/" },
  // 两步验证自助管理页
  { exact: "/admin-ext/two-factor-auth" },
];

/** 获取页面/API 路径所需的最低能力 */
export function getRequiredCapability(pathname: string): string {
  // /admin-ext/* 页面与 API：默认仅管理员。
  // 必须先于 /admin 判断——/admin-ext 同样以 "/admin" 开头，
  // 否则会落入下方 PAGE_CAP 匹配（无一命中）而错误降级为 read。
  if (pathname.startsWith("/admin-ext/")) {
    for (const s of SELF_SERVICE_PATHS) {
      const hit = s.exact ? pathname === s.exact : s.prefix ? pathname.startsWith(s.prefix) : false;
      if (hit) return "read";
    }
    return "manage_options";
  }

  // 后台页面
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    for (const [prefix, cap] of Object.entries(PAGE_CAP)) {
      if (pathname === prefix || pathname.startsWith(prefix + "/")) {
        return cap;
      }
    }
    return "read";
  }

  // API
  if (pathname.startsWith("/api/")) {
    for (const [prefix, cap] of Object.entries(API_CAP)) {
      if (pathname === prefix || pathname.startsWith(prefix + "/")) {
        return cap;
      }
    }
    return "read";
  }

  return "read";
}

/** 角色标签（中文） */
export const ROLE_LABEL: Record<Role, string> = {
  administrator: "管理员",
  editor: "编辑",
  author: "作者",
  contributor: "贡献者",
  subscriber: "订阅者",
};
