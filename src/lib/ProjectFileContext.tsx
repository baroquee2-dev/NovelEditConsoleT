import { createContext, useContext } from "react";

export const ProjectFileContext = createContext<string | null>(null);

export function useProjectFile(): string | null {
  return useContext(ProjectFileContext);
}
