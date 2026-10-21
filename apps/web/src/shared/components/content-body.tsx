import React from 'react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

/** Markdown and basic legacy HTML share a final sanitization boundary. */
export function ContentBody({ content }: { content: string }) {
  return <div className="leading-8 [&_h2]:text-2xl [&_h2]:mt-8 [&_h2]:mb-4 [&_h3]:text-xl [&_h3]:mt-6 [&_p]:my-4 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:ps-6 [&_ol]:ps-6 [&_a]:text-sage-deep [&_a]:underline [&_img]:max-w-full [&_blockquote]:border-s-2 [&_blockquote]:ps-4"><Markdown rehypePlugins={[rehypeRaw, rehypeSanitize]}>{content}</Markdown></div>;
}
