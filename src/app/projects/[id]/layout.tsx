import { AppShell } from "@/components/ui/app-shell";
import { ProjectNav } from "@/components/ui/project-nav";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  return <AppShell nav={<ProjectNav projectId={id} />}>{children}</AppShell>;
}
