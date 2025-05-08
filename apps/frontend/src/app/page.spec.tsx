import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import ChatPage from './page'
import * as api from '../lib/api'
import { ChatResponse, ChatServiceEventData } from '../lib/api'

// Mock the chatWithBot function
jest.mock('../lib/api', () => ({
  ...jest.requireActual('../lib/api'),
  chatWithBot: jest.fn<
    Promise<ChatResponse>,
    [string, (chunk: { content: string }) => void, string | undefined]
  >(),
}))

let mockChatWithBot = api.chatWithBot as jest.MockedFunction<
  typeof api.chatWithBot
>

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  ...jest.requireActual('lucide-react'),
  BotIcon: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid='bot-icon' {...props} />
  ),
  UserIcon: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid='user-icon' {...props} />
  ),
  SendHorizontalIcon: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid='send-icon' {...props} />
  ),
}))

// Mock for scrollIntoView as ScrollArea might call it
window.HTMLElement.prototype.scrollIntoView = jest.fn()

describe('ChatPage', () => {
  beforeEach(() => {
    mockChatWithBot.mockReset()
    // Default mock for tests that don't care about specific chatWithBot behavior
    const defaultMockImpl: (
      query: string,
      onChunkCallback: (chunk: { content: string }) => void,
      sessionId: string | undefined
    ) => Promise<ChatResponse> = async (
      _query: string,
      _onChunkCallback: (chunk: { content: string }) => void,
      _sessionId: string | undefined
    ): Promise<ChatResponse> => {
      return {
        success: true,
        content: 'Default mock response',
        citations: [],
        sessionId: 'default-session-id',
      } as ChatResponse
    }
    mockChatWithBot.mockImplementation(defaultMockImpl as any)
    // Resetting any other potential global state mocks if necessary
  })

  it('renders the chat page title, input, and send button', () => {
    render(<ChatPage />)
    expect(screen.getByText('Tax Agent Chat')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Type your message...')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
  })

  it('allows user to type and send a message, displays user and bot message', async () => {
    const mockImpl: (
      query: string,
      onChunkCallback: (chunk: { content: string }) => void,
      sessionId: string | undefined
    ) => Promise<ChatResponse> = async (
      _query: string,
      onChunkCallback: (chunk: { content: string }) => void,
      _sessionId: string | undefined
    ): Promise<ChatResponse> => {
      onChunkCallback({ content: 'Bot reply ' })
      onChunkCallback({ content: 'to test' })
      return {
        success: true,
        content: 'Bot reply to test',
        citations: [],
        sessionId: 'session-123',
      } as ChatResponse
    }
    mockChatWithBot.mockImplementationOnce(mockImpl as any)
    render(<ChatPage />)
    const inputElement = screen.getByPlaceholderText(
      'Type your message...'
    ) as HTMLInputElement
    const sendButton = screen.getByRole('button', { name: /send/i })

    fireEvent.change(inputElement, { target: { value: 'User test query' } })
    expect(inputElement.value).toBe('User test query')

    fireEvent.click(sendButton)

    await waitFor(() => {
      const firstCallArgs = mockChatWithBot.mock.calls[0]
      expect(firstCallArgs[0]).toBe('User test query')
      expect(typeof firstCallArgs[1]).toBe('function')
      expect(firstCallArgs.length).toBe(2)

      expect(screen.getByText('User test query')).toBeInTheDocument()
      expect(screen.getByText('Bot reply to test')).toBeInTheDocument()
    })
    expect(inputElement.value).toBe('') // Input cleared after sending
  })

  it('displays streamed bot response with citations', async () => {
    const mockCitations: api.ChatCitation[] = [
      {
        id: 'doc1',
        title: 'Document 1',
        source_url: 'http://example.com/doc1',
        pageNumber: 1,
      },
    ]
    const citationMockImpl: (
      query: string,
      onChunkCallback: (chunk: { content: string }) => void,
      sessionId: string | undefined
    ) => Promise<ChatResponse> = async (
      _query: string,
      onChunkCallback: (chunk: { content: string }) => void,
      _sessionId: string | undefined
    ): Promise<ChatResponse> => {
      const chunk1Data: ChatServiceEventData = {
        type: 'llm_chunk',
        content: 'Streamed part 1. ',
      }
      if (chunk1Data.type === 'llm_chunk')
        onChunkCallback({ content: chunk1Data.content })

      const chunk2Data: ChatServiceEventData = {
        type: 'llm_chunk',
        content: 'Streamed part 2.',
      }
      if (chunk2Data.type === 'llm_chunk')
        onChunkCallback({ content: chunk2Data.content })

      // Citations are part of the final response, not individual chunks to onChunk
      return {
        success: true,
        content: 'Streamed part 1. Streamed part 2.',
        citations: mockCitations,
        sessionId: 'session-stream-123',
      } as ChatResponse
    }
    mockChatWithBot.mockImplementationOnce(citationMockImpl as any)

    render(<ChatPage />)
    const inputElement = screen.getByPlaceholderText(
      'Type your message...'
    ) as HTMLInputElement
    const sendButton = screen.getByRole('button', { name: /send/i })

    fireEvent.change(inputElement, { target: { value: 'Query for citations' } })
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(
        screen.getByText('Streamed part 1. Streamed part 2.')
      ).toBeInTheDocument()
      expect(screen.getByText('Sources:')).toBeInTheDocument()
      expect(screen.getByText('Document 1 (Page 1)')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Document 1/i })).toHaveAttribute(
        'href',
        'http://example.com/doc1'
      )
    })
  })

  it('handles API error and displays error message', async () => {
    const errorMockImpl: (
      query: string,
      onChunkCallback: (chunk: { content: string }) => void,
      sessionId: string | undefined
    ) => Promise<ChatResponse> = async (
      _query: string,
      _onChunkCallback: (chunk: { content: string }) => void,
      _sessionId: string | undefined
    ): Promise<ChatResponse> => {
      return {
        success: false,
        error: 'Test API error message',
        sessionId: 'error-session-id',
      } as ChatResponse
    }
    mockChatWithBot.mockImplementationOnce(errorMockImpl as any)

    render(<ChatPage />)
    const inputElement = screen.getByPlaceholderText(
      'Type your message...'
    ) as HTMLInputElement
    const sendButton = screen.getByRole('button', { name: /send/i })

    await act(async () => {
      fireEvent.change(inputElement, { target: { value: 'Trigger error' } })
      fireEvent.click(sendButton)
    })

    await waitFor(() => {
      // The error message should be displayed as the bot's message text
      expect(screen.getByText('Test API error message')).toBeInTheDocument()
      // Check for error styling if specific class is applied
      const errorMessageDiv = screen.getByText('Test API error message')
      expect(errorMessageDiv).toHaveClass('bg-destructive')
    })
  })

  it('handles loading state correctly (input disabled, thinking indicator)', async () => {
    const loadingMockImpl: (
      query: string,
      onChunkCallback: (chunk: { content: string }) => void,
      sessionId: string | undefined
    ) => Promise<ChatResponse> = async (
      _query: string,
      onChunkCallback: (chunk: { content: string }) => void,
      _sessionId: string | undefined
    ): Promise<ChatResponse> => {
      onChunkCallback({ content: 'Loading...' }) // Simulate initial loading chunk
      await new Promise((resolve) => setTimeout(resolve, 50)) // short delay
      // Simulate subsequent data chunk that clears loading and shows actual content
      onChunkCallback({ content: 'Loaded response' })
      return {
        success: true,
        content: 'Loaded response',
        citations: [],
        sessionId: 'session-loading-123',
      } as ChatResponse
    }
    mockChatWithBot.mockImplementationOnce(loadingMockImpl as any)

    render(<ChatPage />)
    const inputElement = screen.getByPlaceholderText(
      'Type your message...'
    ) as HTMLInputElement
    const sendButton = screen.getByRole('button', {
      name: /send/i,
    }) as HTMLButtonElement

    fireEvent.change(inputElement, { target: { value: 'Test loading' } })
    fireEvent.click(sendButton)

    // During loading - this should be checked before the promise is resolved
    await waitFor(() => {
      expect(inputElement.disabled).toBe(true)
      expect(sendButton.disabled).toBe(true)
      expect(screen.getByText(/Thinking.../i)).toBeInTheDocument()
    })

    // Now, resolve the promise and check the aftermath
    await act(async () => {
      // We need to ensure that the microtask queue is flushed and React has re-rendered.
      // A common way is to await a small timeout or await the promise itself if it was returned by mock
      await Promise.resolve() // Helps flush microtasks
    })

    await waitFor(() => {
      expect(inputElement.disabled).toBe(false)
      expect(sendButton.disabled).toBe(false)
      expect(screen.queryByText(/Thinking.../i)).not.toBeInTheDocument()
      expect(screen.getByText('Loaded response')).toBeInTheDocument()
    })
  })

  it('displays multiple messages correctly and scrolls', async () => {
    // Mock chatWithBot to return multiple messages
    const firstMessageMock = async (
      _query: string,
      _onChunk: (chunk: { content: string }) => void,
      _sessionId?: string | undefined
    ): Promise<ChatResponse> => {
      return {
        success: true,
        content: 'First message',
        citations: [],
        sessionId: 's1',
      } as ChatResponse
    }
    const secondMessageMock = async (
      _query: string,
      _onChunk: (chunk: { content: string }) => void,
      _sessionId?: string | undefined
    ): Promise<ChatResponse> => {
      return {
        success: true,
        content: 'Second message',
        citations: [],
        sessionId: 's2',
      } as ChatResponse
    }

    mockChatWithBot
      .mockImplementationOnce(firstMessageMock)
      .mockImplementationOnce(secondMessageMock)

    render(<ChatPage />)
    const inputElement = screen.getByPlaceholderText(
      'Type your message...'
    ) as HTMLInputElement
    const sendButton = screen.getByRole('button', { name: /send/i })

    fireEvent.change(inputElement, { target: { value: 'First query' } })
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(screen.getByText('First message')).toBeInTheDocument()
    })

    // Send another message
    fireEvent.change(inputElement, { target: { value: 'Second query' } })
    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(screen.getByText('Second message')).toBeInTheDocument()
    })
  })
})
