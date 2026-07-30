import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center py-12">
      {/* explicit fallback — prod has no NEXT_PUBLIC_CLERK_*_URL env vars */}
      <SignIn fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
