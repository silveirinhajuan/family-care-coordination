import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { availabilityRouter } from "./routers/availability";
import { commitmentsRouter } from "./routers/commitments";
import { auditRouter, participantsRouter } from "./routers/participants";
import { shiftsRouter } from "./routers/shifts";
import { myProfileRouter } from "./routers/myProfile";
import { caregiversRouter } from "./routers/caregivers";
import { coverageRouter } from "./routers/coverage";
import { emergenciesRouter } from "./routers/emergencies";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  participants: participantsRouter,
  myProfile: myProfileRouter,
  availability: availabilityRouter,
  commitments: commitmentsRouter,
  shifts: shiftsRouter,
  caregivers: caregiversRouter,
  coverage: coverageRouter,
  emergencies: emergenciesRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
