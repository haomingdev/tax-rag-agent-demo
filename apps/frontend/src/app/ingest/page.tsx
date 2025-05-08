'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ingestDocument, IngestResponse } from '@/lib/api';

export default function IngestPage() {
  const [url, setUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<IngestResponse | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!url.trim()) {
      setFeedback({ message: 'URL cannot be empty.', error: 'Validation Error' });
      return;
    }
    setIsLoading(true);
    setFeedback(null); // Clear previous feedback

    // The ingestDocument function from api.ts already catches errors and formats them.
    const result = await ingestDocument(url);
    setFeedback(result);
    
    if (!result.error && result.jobId) {
      // Optionally clear URL on success if desired
      // setUrl(''); 
    }
    setIsLoading(false);
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Ingest Document</CardTitle>
          <CardDescription>
            Enter a URL to ingest a document (e.g., PDF, web page).
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">Document URL</Label>
              <Input
                id="url"
                type="url" // Use type="url" for basic browser validation
                placeholder="https://example.com/document.pdf"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isLoading}
                required // HTML5 validation
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-start space-y-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Ingesting...' : 'Ingest Document'}
            </Button>
            {feedback && (
              <div 
                className={`mt-4 p-3 rounded-md w-full text-sm ${
                  feedback.error 
                  ? 'bg-red-100 border border-red-400 text-red-700' 
                  : 'bg-green-100 border border-green-400 text-green-700'
                }`}
                role="alert"
              >
                <p className="font-bold">{feedback.error ? 'Error' : 'Status'}</p>
                <p>{feedback.message}</p>
                {feedback.jobId && (
                  <p className="mt-1">
                    Job ID: <span className="font-mono text-xs">{feedback.jobId}</span>
                  </p>
                )}
              </div>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
