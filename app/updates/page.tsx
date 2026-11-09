import fs from 'node:fs';
import path from 'node:path';
import UpdateCenter from './UpdateCenter';

export const metadata = {
  title: 'Update Center · AppMintly',
  description: 'Your apps at their latest published version. Versions come from the published AppMintly catalog.',
};

export default function UpdatesPage() {
  const dir = path.join(process.cwd(), 'app', 'updates');
  const css = fs.readFileSync(path.join(dir, 'updates.css'), 'utf8');
  const shell = fs.readFileSync(path.join(dir, 'shell.html'), 'utf8');
  return <UpdateCenter css={css} shell={shell} />;
}
