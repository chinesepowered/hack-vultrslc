import { Nav, usePath, Footer } from './ui';
import { Home } from './pages/Home';
import { Errand } from './pages/Errand';
import { RunPage } from './pages/RunPage';
import { TestPage } from './pages/TestPage';
import { HowPage } from './pages/HowPage';

export function App() {
  const path = usePath();
  const runMatch = path.match(/^\/run\/([a-f0-9]{10})/);
  let page;
  if (runMatch) page = <RunPage id={runMatch[1]} />;
  else if (path.startsWith('/errand')) page = <Errand />;
  else if (path.startsWith('/test')) page = <TestPage />;
  else if (path.startsWith('/how')) page = <HowPage />;
  else page = <Home />;
  const bare = new URLSearchParams(location.search).has('bare');
  return (
    <div className={`app ${runMatch ? 'app-run' : ''} ${bare ? 'bare' : ''}`}>
      {!bare && <Nav path={path} />}
      <main>{page}</main>
      {!runMatch && !bare && <Footer />}
    </div>
  );
}
