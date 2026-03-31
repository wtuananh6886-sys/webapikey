#import "AOVLicenseTimeUtils.h"

@implementation AOVLicenseTimeUtils

+ (NSDateFormatter *)isoFormatterWithMillis:(BOOL)millis {
    NSDateFormatter *f = [NSDateFormatter new];
    f.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    f.timeZone = [NSTimeZone timeZoneWithAbbreviation:@"UTC"];
    f.dateFormat = millis ? @"yyyy-MM-dd'T'HH:mm:ss.SSSXXXXX" : @"yyyy-MM-dd'T'HH:mm:ssXXXXX";
    return f;
}

+ (nullable NSDate *)parseISODate:(NSString *)isoString {
    if (isoString.length == 0 || [isoString isEqualToString:@"-"]) return nil;
    NSDate *d = [[self isoFormatterWithMillis:NO] dateFromString:isoString];
    if (!d) d = [[self isoFormatterWithMillis:YES] dateFromString:isoString];
    return d;
}

+ (NSString *)remainingTextFromExpiryString:(NSString *)expiryISO {
    NSDate *exp = [self parseISODate:expiryISO];
    if (!exp) return @"Remaining: unknown";

    NSCalendar *cal = [NSCalendar currentCalendar];
    NSDate *now = [NSDate date];
    if ([exp compare:now] != NSOrderedDescending) return @"Remaining: expired";

    NSDateComponents *cmp = [cal components:NSCalendarUnitDay|NSCalendarUnitHour|NSCalendarUnitMinute
                                   fromDate:now
                                     toDate:exp
                                    options:0];
    NSInteger d = MAX(cmp.day, 0);
    NSInteger h = MAX(cmp.hour, 0);
    NSInteger m = MAX(cmp.minute, 0);
    return [NSString stringWithFormat:@"Remaining: %ldd %ldh %ldm", (long)d, (long)h, (long)m];
}

+ (NSString *)displayExpiryText:(NSString *)expiryISO {
    NSDate *exp = [self parseISODate:expiryISO];
    if (!exp) return [NSString stringWithFormat:@"Expires at: %@", expiryISO ?: @"-"];

    NSDateFormatter *display = [NSDateFormatter new];
    display.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    display.timeZone = [NSTimeZone localTimeZone];
    display.dateFormat = @"dd/MM/yyyy HH:mm:ss";
    return [NSString stringWithFormat:@"Expires at: %@", [display stringFromDate:exp]];
}

@end
