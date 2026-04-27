#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface MLingoAppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@end

@implementation MLingoAppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.websiteDataStore = [WKWebsiteDataStore defaultDataStore];

    self.webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    self.webView.navigationDelegate = self;

    NSRect frame = NSMakeRect(0, 0, 1220, 820);
    self.window = [[NSWindow alloc] initWithContentRect:frame
                                              styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable | NSWindowStyleMaskFullSizeContentView
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    [self.window center];
    [self.window setTitle:@"MLingo"];
    [self.window setTitlebarAppearsTransparent:YES];
    [self.window setContentView:self.webView];
    [self.window makeKeyAndOrderFront:nil];

    [self loadBundledApp];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (void)webView:(WKWebView *)webView
decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    BOOL linkActivated = navigationAction.navigationType == WKNavigationTypeLinkActivated;
    BOOL isExternal = [url.scheme isEqualToString:@"http"] || [url.scheme isEqualToString:@"https"];

    if (linkActivated && isExternal) {
        [[NSWorkspace sharedWorkspace] openURL:url];
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }

    decisionHandler(WKNavigationActionPolicyAllow);
}

- (void)loadBundledApp {
    NSURL *resourceURL = [[NSBundle mainBundle] resourceURL];
    NSURL *webRoot = [resourceURL URLByAppendingPathComponent:@"web" isDirectory:YES];
    NSURL *indexURL = [webRoot URLByAppendingPathComponent:@"index.html"];
    [self.webView loadFileURL:indexURL allowingReadAccessToURL:webRoot];
}

@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        MLingoAppDelegate *delegate = [[MLingoAppDelegate alloc] init];
        [app setDelegate:delegate];
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        [app activateIgnoringOtherApps:YES];
        [app run];
    }
    return 0;
}
