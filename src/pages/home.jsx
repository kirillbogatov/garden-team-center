import { AssistantWorkspace } from '@/components/assistant';
import { Page } from '@/components/page';

export function HomePage({ user }) {
  return <Page><AssistantWorkspace user={user}/></Page>;
}
