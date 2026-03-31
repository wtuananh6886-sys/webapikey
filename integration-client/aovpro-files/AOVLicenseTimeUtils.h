#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface AOVLicenseTimeUtils : NSObject

+ (nullable NSDate *)parseISODate:(NSString *)isoString;
+ (NSString *)remainingTextFromExpiryString:(NSString *)expiryISO;
+ (NSString *)displayExpiryText:(NSString *)expiryISO;

@end

NS_ASSUME_NONNULL_END
