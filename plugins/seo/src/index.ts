import { definePlugin, registerSidebarPanel } from "@astropress/core";

export default definePlugin({
  name: "seo",
  version: "0.1.0",
  description: "SEO meta fields (title, description, focus keyword) stored as wp_postmeta.",

  register() {
    registerSidebarPanel("seo", {
      id: "seo",
      title: "SEO",
      postTypes: ["post", "page"],
      componentId: "SeoPanel",
    });
  },
});
