'use client';

import React, { useState, useEffect, useRef, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { chatWithBot, ChatResponse } from '@/lib/api'; // Assuming ChatResponse is defined in api.ts
import { SendHorizontalIcon, UserIcon, BotIcon } from 'lucide-react'; // Using lucide-react icons

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  citations?: ChatResponse['citations']; // Optional citations
  error?: boolean; // To indicate an error message from the bot
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Function to scroll to the bottom of the chat
  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      // Access the viewport element from the ScrollArea component instance
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputValue.trim(),
    };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Placeholder for bot's streamed response
    const botMessageId = (Date.now() + 1).toString();
    setMessages((prevMessages) => [
      ...prevMessages,
      {
        id: botMessageId,
        sender: 'bot',
        text: '', // Initially empty, will be filled by stream
      },
    ]);

    try {
      // TODO: Implement actual SSE handling with chatWithBot
      // For now, simulate a delay and a response
      // await new Promise(resolve => setTimeout(resolve, 1500));
      // const mockBotResponse: ChatMessage = {
      //   id: botMessageId,
      //   sender: 'bot',
      //   text: 'This is a simulated response from the bot.',
      // }; 
      // setMessages((prevMessages) => 
      //   prevMessages.map(msg => msg.id === botMessageId ? mockBotResponse : msg)
      // );

      // Example of how chatWithBot might be called (actual SSE handling is more complex)
      const response = await chatWithBot(userMessage.text, (chunk) => {
        // This callback will be called for each chunk of data from SSE
        // console.log('Received chunk:', chunk);
        setMessages(prev => prev.map(msg => 
          msg.id === botMessageId ? { ...msg, text: msg.text + chunk.content } : msg
        ));
      });

      if (response.error) {
        setMessages(prev => prev.map(msg => 
          msg.id === botMessageId ? { ...msg, text: response.error || 'An error occurred.', error: true } : msg
        ));
      } else if (response.success && response.content) {
        // Ensure the final content from the response is set, if not already fully handled by chunks
        setMessages(prev => prev.map(msg => 
          msg.id === botMessageId ? { ...msg, text: response.content ?? msg.text ?? '' } : msg
        ));
      }
      // Citations can be handled here after the stream is complete, if they come as a final part
      if (response.citations && response.citations.length > 0) {
        setMessages(prev => prev.map(msg => 
          msg.id === botMessageId ? { ...msg, citations: response.citations } : msg
        ));
      }

    } catch (error) {
      console.error('Chat API error:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === botMessageId ? { ...msg, text: 'Failed to get response from bot.', error: true } : msg
      ));
    }

    setIsLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-2xl h-[70vh] flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BotIcon className="h-6 w-6" /> Tax Agent Chat
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-grow overflow-hidden">
          <ScrollArea className="h-full pr-4" ref={scrollAreaRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-end gap-2 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.sender === 'bot' && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback><BotIcon size={18}/></AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${message.sender === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : message.error ? 'bg-destructive text-destructive-foreground' : 'bg-muted'}`}
                  >
                    {message.text}
                    {message.citations && message.citations.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-muted-foreground/20">
                        <p className="text-xs font-semibold mb-1">Sources:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {message.citations.map((citation, index) => (
                            <li key={index} className="text-xs">
                              <a 
                                href={citation.source_url}
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="hover:underline"
                              >
                                {`${citation.source_name || citation.title || `Source ${index + 1}`}${citation.pageNumber ? ` (Page ${citation.pageNumber})` : ''}`}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {message.sender === 'user' && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback><UserIcon size={18}/></AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
              {isLoading && (
                 <div className="flex items-end gap-2 justify-start">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback><BotIcon size={18}/></AvatarFallback>
                    </Avatar>
                    <div className="max-w-[70%] rounded-lg px-3 py-2 text-sm bg-muted animate-pulse">
                      Thinking...
                    </div>
                  </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
        <CardFooter>
          <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
            <Input
              id="message"
              placeholder="Type your message..."
              className="flex-1"
              autoComplete="off"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isLoading}
            />
            <Button type="submit" size="icon" disabled={isLoading}>
              <SendHorizontalIcon className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
