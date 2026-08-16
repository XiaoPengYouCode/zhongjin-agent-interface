import { createContext, useContext } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
} from "@tanstack/react-router";
import { Sidebar } from "./components/Sidebar.tsx";
import { usePi, type PiActions, type PiState } from "./state.ts";
import { useTheme, type ThemeMode } from "./lib/theme.ts";
import type { SessionInfo, SessionStatus } from "./lib/types.ts";

/** 应用级共享数据：由 Shell（根路由）注入，各视图经 usePiApi 获取。 */
export interface PiApi {
  state: PiState;
  sessions: SessionInfo[];
  statuses: Record<string, SessionStatus>;
  actions: PiActions;
  theme: ThemeMode;
  setTheme: (m: ThemeMode) => void;
}

const PiApiContext = createContext<PiApi | null>(null);

export function usePiApi(): PiApi {
  const api = useContext(PiApiContext);
  if (!api) throw new Error("usePiApi must be used inside Shell");
  return api;
}

/** 应用外壳：侧边栏常驻，主区由路由决定（/ = 聊天，/settings = 设置）。 */
function Shell() {
  const { state, sessions, statuses, actions } = usePi();
  const [theme, setTheme] = useTheme();
  const api: PiApi = { state, sessions, statuses, actions, theme, setTheme };
  return (
    <PiApiContext.Provider value={api}>
      <div className="app">
        <Sidebar
          sessions={sessions}
          statuses={statuses}
          currentFile={state.session?.sessionFile ?? null}
          currentCwd={state.session?.cwd ?? null}
          onNew={actions.newSession}
          onResume={actions.resume}
          onDelete={actions.deleteSession}
        />
        <Outlet />
      </div>
    </PiApiContext.Provider>
  );
}

const rootRoute = createRootRoute({ component: Shell });

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("./components/ChatView.tsx"), "ChatView"),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: lazyRouteComponent(() => import("./components/Settings.tsx"), "SettingsView"),
});

const routeTree = rootRoute.addChildren([chatRoute, settingsRoute]);

export const router = createRouter({ routeTree });
