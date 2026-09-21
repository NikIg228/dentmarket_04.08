import {
  registrationResumeCompletedSchema, registrationResumeDetailsSchema, registrationResumeRequestedSchema,
  type RegistrationResumeComplete, type RegistrationResumeRequest,
} from "@marketplace/schemas";
import { authRequest } from "../../auth-client";

export async function requestResume(input: RegistrationResumeRequest) {
  return registrationResumeRequestedSchema.parse(await authRequest("/auth/registration/resume/request", input));
}
export async function inspectResume(token: string) {
  return registrationResumeDetailsSchema.parse(await authRequest("/auth/registration/resume/inspect", { token }));
}
export async function completeResume(input: RegistrationResumeComplete) {
  return registrationResumeCompletedSchema.parse(await authRequest("/auth/registration/resume/complete", input));
}
