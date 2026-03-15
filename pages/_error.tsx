import type { NextPageContext } from 'next';

type ErrorPageProps = {
  statusCode?: number;
};

function ErrorPage({ statusCode }: ErrorPageProps) {
  const code = statusCode ?? 500;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {code === 404 ? 'Not Found' : 'Server Error'}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          {code === 404 ? 'Page not found.' : 'Something went wrong.'}
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          {code === 404
            ? 'The page you requested could not be found.'
            : 'The page failed to render. Refresh and try again. If the problem persists, check the server logs for the underlying route error.'}
        </p>
      </div>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => ({
  statusCode: res?.statusCode ?? err?.statusCode ?? 500,
});

export default ErrorPage;
