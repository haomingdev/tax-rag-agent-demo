import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { of, throwError } from 'rxjs';
import { MessageEvent } from '@nestjs/common';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: ChatService;

  const mockChatService = {
    sendMessageAndStreamResponse: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: mockChatService,
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    chatService = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('chat', () => {
    it('should call chatService.sendMessageAndStreamResponse and return an observable of message events', (done) => {
      const createChatDto: CreateChatDto = { query: 'Hello', sessionId: '123' };
      const mockMessageEvents: MessageEvent[] = [
        { data: { type: 'llm_chunk', content: 'Hi' } },
        { data: { type: 'llm_chunk', content: ' there!' } },
        { data: { type: 'llm_sources', sources: [{id: 's1', title: 'Source 1'}] } },
      ];
      const mockObservable = of(...mockMessageEvents);

      mockChatService.sendMessageAndStreamResponse.mockReturnValue(mockObservable);

      const resultObservable = controller.chat(createChatDto);

      expect(chatService.sendMessageAndStreamResponse).toHaveBeenCalledWith(createChatDto.query, createChatDto.sessionId);

      const receivedEvents: MessageEvent[] = [];
      resultObservable.subscribe({
        next: (event) => receivedEvents.push(event),
        complete: () => {
          expect(receivedEvents).toEqual(mockMessageEvents);
          done();
        },
        error: (err) => done.fail(err),
      });
    });

    it('should handle errors from chatService.sendMessageAndStreamResponse', (done) => {
      const createChatDto: CreateChatDto = { query: 'Error test', sessionId: '456' };
      const serviceError = new Error('Service Error');
      const mockErrorObservable = throwError(() => serviceError);

      mockChatService.sendMessageAndStreamResponse.mockReturnValue(mockErrorObservable);

      const resultObservable = controller.chat(createChatDto);

      expect(chatService.sendMessageAndStreamResponse).toHaveBeenCalledWith(createChatDto.query, createChatDto.sessionId);

      resultObservable.subscribe({
        next: () => done.fail('Should not emit next on error'),
        complete: () => done.fail('Should not complete on error'),
        error: (err) => {
          expect(err).toBe(serviceError);
          done();
        },
      });
    });
  });
});
