import { BadRequestException, Body, Controller, Header, HttpCode, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { registrationResumeCompleteSchema, registrationResumeProofSchema, registrationResumeRequestSchema } from "@marketplace/schemas";
import { ApiCoreBody, ApiCoreResponse } from "../../platform/openapi/core-openapi";
import { RegistrationResumeService } from "./registration-resume.service";

@ApiTags("registration-resume")
@Controller("auth/registration/resume")
@Throttle({ ip: { limit: 20, ttl: 60_000 }, user: { limit: 20, ttl: 60_000 }, tenant: { limit: 20, ttl: 60_000 } })
export class RegistrationResumeController {
  constructor(private readonly resume: RegistrationResumeService) {}

  @Post("request") @HttpCode(200) @Header("Cache-Control", "no-store")
  @Throttle({ ip: { limit: 5, ttl: 60_000 } })
  @ApiCoreBody("RegistrationResumeRequest") @ApiCoreResponse("RegistrationResumeRequestedResponse")
  @ApiCoreResponse("ErrorResponse", 400) @ApiCoreResponse("ErrorResponse", 429) @ApiCoreResponse("ErrorResponse", 503)
  request(@Body() body: unknown) {
    const parsed = registrationResumeRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Укажите корректный email, БИН из 12 цифр и роль регистрации.");
    return this.resume.request(parsed.data);
  }

  @Post("inspect") @HttpCode(200) @Header("Cache-Control", "no-store")
  @ApiCoreBody("RegistrationResumeProofRequest") @ApiCoreResponse("RegistrationResumeDetailsResponse")
  @ApiCoreResponse("ErrorResponse", 400) @ApiCoreResponse("ErrorResponse", 401) @ApiCoreResponse("ErrorResponse", 429)
  inspect(@Body() body: unknown) {
    const parsed = registrationResumeProofSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Ссылка продолжения неполная. Запросите новое письмо.");
    return this.resume.inspect(parsed.data.token);
  }

  @Post("complete") @HttpCode(200) @Header("Cache-Control", "no-store")
  @ApiCoreBody("RegistrationResumeCompleteRequest") @ApiCoreResponse("RegistrationResumeCompletedResponse")
  @ApiCoreResponse("ErrorResponse", 400) @ApiCoreResponse("ErrorResponse", 401) @ApiCoreResponse("ErrorResponse", 409) @ApiCoreResponse("ErrorResponse", 429)
  complete(@Body() body: unknown) {
    const parsed = registrationResumeCompleteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Проверьте данные заявки и пароль (12–128 символов).");
    return this.resume.complete(parsed.data);
  }
}
