import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center py-12">
      {/* explicit fallback — prod has no NEXT_PUBLIC_CLERK_*_URL env vars */}
      <SignUp fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
