import { Body, Controller, Post, Sse, MessageEvent, UsePipes, ValidationPipe, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CreateChatDto } from './dto/create-chat.dto';
import { ChatService } from './chat.service';
import { Observable } from 'rxjs';

@ApiTags('Chat API')
@Controller('chat') // Base path for this controller will be /chat
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService
  ) {}

  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true })) // Apply validation for DTO
  @ApiOperation({ summary: 'Send a chat message and get a streamed response' })
  @ApiBody({ type: CreateChatDto })
  @ApiResponse({ status: 200, description: 'Stream of chat responses (text/event-stream)' })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid input data' })
  @Sse()
  async chat(@Body() createChatDto: CreateChatDto): Promise<Observable<MessageEvent>> {
    this.logger.log(`Received chat request: ${JSON.stringify(createChatDto)}`);
    const { query, sessionId } = createChatDto;

    return this.chatService.sendMessageAndStreamResponse(query, sessionId);
  }
}
