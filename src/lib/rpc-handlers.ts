// Central registry of RPC handlers. Each entry extracts the handler logic from
// the corresponding createServerFn so it can be called directly from the
// /api/rpc route, bypassing the broken server-function RPC system.

import { generateNewsHandler } from "./news.functions";
import { generatePressQuestionsHandler, generateNextPressQuestionHandler, scorePressAnswerHandler, writePressRecapHandler, runAiPressConferenceHandler } from "./press-conference.functions";
import { negotiateTradeHandler, generateManagerHandler } from "./negotiation.functions";
import { generateAiTradeProposalsHandler } from "./trade-ai.functions";
import { negotiateAgentHandler, generateAgentHandler } from "./agent-negotiation.functions";
import { generateProspectRatingsHandler, aiDraftPickHandler } from "./draft-ai.functions";
import { sendDmHandler, scoreBroadcastHandler } from "./messages.functions";
import { interpretSearchHandler } from "./player-search.functions";
import { boardroomSackingReviewHandler } from "./sacking.functions";
import { generateScheduleHandler, fixScheduleWeekHandler } from "./schedule-ai.functions";

const handlers: Record<string, (data: unknown) => Promise<unknown>> = {
  generateNews: generateNewsHandler,
  generatePressQuestions: generatePressQuestionsHandler,
  generateNextPressQuestion: generateNextPressQuestionHandler,
  scorePressAnswer: scorePressAnswerHandler,
  writePressRecap: writePressRecapHandler,
  runAiPressConference: runAiPressConferenceHandler,
  negotiateTrade: negotiateTradeHandler,
  generateManager: generateManagerHandler,
  generateAiTradeProposals: generateAiTradeProposalsHandler,
  negotiateAgent: negotiateAgentHandler,
  generateAgent: generateAgentHandler,
  generateProspectRatings: generateProspectRatingsHandler,
  aiDraftPick: aiDraftPickHandler,
  sendDm: sendDmHandler,
  scoreBroadcast: scoreBroadcastHandler,
  interpretSearch: interpretSearchHandler,
  boardroomSackingReview: boardroomSackingReviewHandler,
  generateSchedule: generateScheduleHandler,
  fixScheduleWeek: fixScheduleWeekHandler,
};

export default handlers;
