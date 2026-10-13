import { useEffect, useState } from "react";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const AUDIT_STAGES = [
  { name: "Scanning Website", description: "Fetching pages and sitemap" },
  { name: "Extracting Content Signals", description: "Analyzing content structure" },
  { name: "Calculating Platform Scores", description: "Scoring across AI platforms" },
  { name: "Generating Topics", description: "Creating content recommendations" },
  { name: "Finalizing Report", description: "Compiling your audit results" }
];

const DEFAULT_LOADING_MESSAGES = [
  "Good things take time—like getting recommended by AI engines..",
  "Analyzing how ChatGPT, Perplexity, Gemini, and Claude view your website",
  "Scanning 1000+ AI search patterns to find your AI readiness opportunities..",
  "Comparing your domain authority against top-ranked AI recommendations...",
  "Identifying content gaps where your competitors are getting recommended...",
  "We're building your roadmap to AI search dominance. Worth the wait!",
  "Fun fact: 99% of businesses aren't on AI search radar. You're about to join the 1%.",
  "Deep analysis in progress—your competitors wish they had this intel...",
  "Scoring your content across ChatGPT, Perplexity, Gemini and Claude...",
  "Our AI is analyzing millions of successful AI recommendations to predict your best topics...",
  "Running advanced entity recognition and content structure optimization...",
  "Drafting content topics that AI platforms will love recommending. Almost there!"
];

interface LoadingStateProps {
  currentStage?: number;
}

export default function LoadingState({ currentStage = 0 }: LoadingStateProps) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const loadingMessages = DEFAULT_LOADING_MESSAGES;
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedStage, setEstimatedStage] = useState(0);

  // Time-based stage estimation (when real stage not provided)
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Estimate stage based on elapsed time if not receiving real updates
  useEffect(() => {
    if (currentStage === 0) {
      // Time-based estimation: stages progress roughly every 15 seconds
      const estimatedFromTime = Math.min(Math.floor(elapsedTime / 15), AUDIT_STAGES.length - 1);
      setEstimatedStage(estimatedFromTime);
    } else {
      setEstimatedStage(currentStage);
    }
  }, [elapsedTime, currentStage]);

  const displayStage = estimatedStage;
  const progressPercent = Math.round(((displayStage + 1) / AUDIT_STAGES.length) * 100);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      
      setTimeout(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % loadingMessages.length);
        setFade(true);
      }, 300);
    }, 4000); // Change message every 4 seconds

    return () => clearInterval(interval);
  }, [loadingMessages]);

  return (
    <section className="mb-12">
      <div className="max-w-3xl mx-auto text-center">
        {/* Warning Banner */}
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <span className="text-sm text-amber-800 font-medium">
            Please do not close or switch tabs while your AI audit report is being generated
          </span>
        </div>

        <Card className="bg-gradient-to-br from-card via-card to-primary/5 border-2 border-primary/20 shadow-2xl">
          <CardContent className="p-12">
            {/* Animated Spinner */}
            <div className="relative mb-8 flex justify-center">
              <div className="relative w-24 h-24">
                {/* Outer ring - static */}
                <div className="absolute inset-0 rounded-full border-4 border-primary/10"></div>
                
                {/* Spinning ring */}
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"></div>
                
                {/* Inner pulsing icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="h-12 w-12 text-primary animate-pulse" />
              </div>
              </div>
            </div>

            {/* Main Title */}
            <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-primary to-gray-600 bg-clip-text text-transparent">
              AI Readiness Analysis in Progress
            </h3>

            {/* Stage Progress Indicator */}
            <div className="mb-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-sm font-semibold text-primary">
                  Step {displayStage + 1} of {AUDIT_STAGES.length}
                </span>
                <span className="text-sm text-muted-foreground">
                  — {AUDIT_STAGES[displayStage].name}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {AUDIT_STAGES[displayStage].description}
              </p>
              {/* Progress Bar */}
              <Progress value={progressPercent} className="h-2 mb-1" />
              <p className="text-xs text-muted-foreground">~{progressPercent}% complete (estimated)</p>
            </div>

            {/* Rotating Messages */}
            <div className="min-h-[80px] flex items-center justify-center mb-6">
              <p 
                className={`text-lg text-muted-foreground max-w-2xl transition-opacity duration-300 ${
                  fade ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ 
                  fontStyle: 'italic',
                  lineHeight: '1.6'
                }}
              >
                {loadingMessages[currentMessageIndex]}
              </p>
            </div>

            {/* Timer */}
            <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>
                Elapsed: {Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, '0')}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
