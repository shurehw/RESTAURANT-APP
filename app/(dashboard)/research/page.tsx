'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Trash2,
  Loader2,
  MapPin,
} from 'lucide-react';

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  imageUrl?: string;
  position?: number;
}

interface SavedBookmark {
  id: string;
  title: string;
  url: string | null;
  snippet: string | null;
  source: string;
  image_url: string | null;
  notes: string | null;
  created_at: string;
}

export default function ResearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [bookmarks, setBookmarks] = useState<SavedBookmark[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'saved'>('search');
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());

  const loadBookmarks = useCallback(async () => {
    try {
      const res = await fetch('/api/research/bookmarks');
      const data = await res.json();
      if (data.success) {
        setBookmarks(data.bookmarks);
        setSavedUrls(new Set(data.bookmarks.map((b: SavedBookmark) => b.url).filter(Boolean)));
      }
    } catch (error) {
      console.error('Error loading bookmarks:', error);
    }
  }, []);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || searching) return;

    setSearching(true);
    try {
      const res = await fetch('/api/research/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();

      if (data.success && data.results) {
        const organic = data.results.organic || [];
        setResults(
          organic.map((r: any) => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet,
            imageUrl: r.imageUrl || r.thumbnail,
            position: r.position,
          }))
        );
        setActiveTab('search');
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSave = async (result: SearchResult) => {
    try {
      const res = await fetch('/api/research/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: result.title,
          url: result.link,
          snippet: result.snippet,
          source: 'serper',
          image_url: result.imageUrl || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBookmarks((prev) => [data.bookmark, ...prev]);
        setSavedUrls((prev) => new Set([...prev, result.link]));
      }
    } catch (error) {
      console.error('Error saving bookmark:', error);
    }
  };

  const handleDelete = async (id: string, url: string | null) => {
    try {
      const res = await fetch(`/api/research/bookmarks?id=${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setBookmarks((prev) => prev.filter((b) => b.id !== id));
        if (url) {
          setSavedUrls((prev) => {
            const next = new Set(prev);
            next.delete(url);
            return next;
          });
        }
      }
    } catch (error) {
      console.error('Error deleting bookmark:', error);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Research</h1>
        <p className="text-gray-600 mt-2">
          Scout locations, competitors, and ideas for new openings
        </p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search restaurants, locations, market data..."
              className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-opsos-sage-500 focus:border-transparent text-base"
            />
          </div>
          <Button
            type="submit"
            disabled={searching || !query.trim()}
            className="bg-opsos-sage-600 hover:bg-opsos-sage-700 px-6"
          >
            {searching ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Search'
            )}
          </Button>
        </div>
      </form>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'search'
              ? 'border-opsos-sage-600 text-opsos-sage-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Search className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Results
          {results.length > 0 && (
            <Badge variant="outline" className="ml-2 text-xs">
              {results.length}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'saved'
              ? 'border-opsos-sage-600 text-opsos-sage-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Bookmark className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
          Saved
          {bookmarks.length > 0 && (
            <Badge variant="outline" className="ml-2 text-xs">
              {bookmarks.length}
            </Badge>
          )}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'search' && (
        <div className="space-y-3">
          {results.length === 0 && !searching && (
            <div className="text-center py-16 text-gray-400">
              <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Search for restaurants, locations, or market intel</p>
              <p className="text-sm mt-1">
                Try &quot;best restaurant neighborhoods Dallas&quot; or &quot;new restaurant openings 2026&quot;
              </p>
            </div>
          )}

          {results.map((result, i) => (
            <ResultCard
              key={i}
              result={result}
              isSaved={savedUrls.has(result.link)}
              onSave={() => handleSave(result)}
            />
          ))}
        </div>
      )}

      {activeTab === 'saved' && (
        <div className="space-y-3">
          {bookmarks.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Bookmark className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No saved items yet</p>
              <p className="text-sm mt-1">
                Search and pin results to save them here
              </p>
            </div>
          )}

          {bookmarks.map((bookmark) => (
            <BookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
              onDelete={() => handleDelete(bookmark.id, bookmark.url)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({
  result,
  isSaved,
  onSave,
}: {
  result: SearchResult;
  isSaved: boolean;
  onSave: () => void;
}) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <a
              href={result.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 hover:text-blue-900 font-medium text-base leading-snug line-clamp-2"
            >
              {result.title}
              <ExternalLink className="w-3.5 h-3.5 inline-block ml-1.5 opacity-50" />
            </a>
            <button
              onClick={onSave}
              disabled={isSaved}
              className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                isSaved
                  ? 'text-opsos-sage-600 bg-opsos-sage-50'
                  : 'text-gray-400 hover:text-opsos-sage-600 hover:bg-gray-50'
              }`}
              title={isSaved ? 'Saved' : 'Save to bookmarks'}
            >
              {isSaved ? (
                <BookmarkCheck className="w-5 h-5" />
              ) : (
                <Bookmark className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-xs text-green-700 mt-1 truncate">{result.link}</p>
          <p className="text-sm text-gray-600 mt-1.5 line-clamp-2">
            {result.snippet}
          </p>
        </div>
      </div>
    </Card>
  );
}

function BookmarkCard({
  bookmark,
  onDelete,
}: {
  bookmark: SavedBookmark;
  onDelete: () => void;
}) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {bookmark.url ? (
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 hover:text-blue-900 font-medium text-base leading-snug line-clamp-2"
                >
                  {bookmark.title}
                  <ExternalLink className="w-3.5 h-3.5 inline-block ml-1.5 opacity-50" />
                </a>
              ) : (
                <span className="font-medium text-gray-900">{bookmark.title}</span>
              )}
              {bookmark.url && (
                <p className="text-xs text-green-700 mt-1 truncate">
                  {bookmark.url}
                </p>
              )}
            </div>
            <button
              onClick={onDelete}
              className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Remove bookmark"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          {bookmark.snippet && (
            <p className="text-sm text-gray-600 mt-1.5 line-clamp-2">
              {bookmark.snippet}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="outline" className="text-xs">
              {bookmark.source}
            </Badge>
            <span className="text-xs text-gray-400">
              {new Date(bookmark.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
